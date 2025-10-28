import { Component, signal, effect, inject, ViewChild, ElementRef, afterNextRender, ChangeDetectionStrategy, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from './services/data.service';
import { GeminiService } from './services/gemini.service';
import { CountryData, SingleStockData, ChatMessage } from './models';

declare var Chart: any;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private dataService = inject(DataService);
  private geminiService = inject(GeminiService);

  // View management
  activeView = signal<'correlation' | 'predictor' | 'chatbot' | 'contact'>('correlation');

  // --- Correlation View State ---
  @ViewChild('covidChartCanvas') covidChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('stockChartCanvas') stockChartCanvas!: ElementRef<HTMLCanvasElement>;
  countries = this.dataService.getAvailableCountries();
  selectedCountry: WritableSignal<string> = signal(this.countries[0]);
  countryData = signal<CountryData | null>(null);
  analysis = signal<string>('');
  stockPrediction = signal<string>(''); // For stock index
  isLoadingData = signal<boolean>(true);
  isAnalyzing = signal<boolean>(true);
  isPredicting = signal<boolean>(true);
  private covidChart: any;
  private stockChart: any;

  // --- Predictor View State ---
  @ViewChild('singleStockChartCanvas') singleStockChartCanvas!: ElementRef<HTMLCanvasElement>;
  stocks = this.dataService.getAvailableStocks();
  selectedStock: WritableSignal<string> = signal(this.stocks[0].ticker);
  singleStockData = signal<SingleStockData | null>(null);
  singleStockPrediction = signal<string>('');
  isLoadingSingleStock = signal<boolean>(false);
  isPredictingSingleStock = signal<boolean>(false);
  predictionPeriod = signal<number>(30);
  private singleStockChart: any;

  // --- Chatbot View State ---
  chatHistory = signal<ChatMessage[]>([]);
  chatMessage = signal<string>('');
  isChatting = signal<boolean>(false);

  // --- Help Bot State ---
  @ViewChild('helpModal') helpModal!: ElementRef<HTMLDialogElement>;
  helpQuery = signal<string>('');
  helpResponse = signal<string>('');
  isGettingHelp = signal<boolean>(false);
  
  // --- Common State ---
  themes = ['night', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave', 'retro', 'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua', 'lofi', 'pastel', 'fantasy', 'wireframe', 'black', 'luxury', 'dracula', 'cmyk', 'autumn', 'business', 'acid', 'lemonade', 'coffee', 'winter'];

  constructor() {
    afterNextRender(() => {
        // Load initial data for the default view
        this.loadDataForCountry(this.selectedCountry());
    });
    
    // Initialize services that require it
    this.geminiService.startChat();
    this.chatHistory.set([{ role: 'model', text: 'Hello! I am your AI assistant. How can I help you today?' }]);


    // Effect for Correlation View
    effect(() => {
        const country = this.selectedCountry();
        const data = this.countryData();
        if (this.activeView() === 'correlation' && data) {
            this.updateCorrelationCharts(data);
            this.runAnalysis(country, data);
            this.runPrediction(country, data);
        }
    });

    // Effect for Predictor View
    effect(() => {
        const ticker = this.selectedStock();
        const data = this.singleStockData();
        const period = this.predictionPeriod();
        if (this.activeView() === 'predictor' && data) {
            this.updateSingleStockChart(data);
            this.runSingleStockPrediction(ticker, data, period);
        }
    });
  }

  setView(view: 'correlation' | 'predictor' | 'chatbot' | 'contact'): void {
    if (this.activeView() === view) return;
    this.activeView.set(view);

    // When switching to predictor for the first time, load its data
    if (view === 'predictor' && !this.singleStockData()) {
        this.loadDataForStock(this.selectedStock());
    }
  }

  // --- Chatbot Methods ---
  async sendMessage(): Promise<void> {
    const message = this.chatMessage().trim();
    if (!message) return;

    this.chatHistory.update(history => [...history, { role: 'user', text: message }]);
    this.chatMessage.set('');
    this.isChatting.set(true);

    const response = await this.geminiService.getChatResponse(message);
    this.chatHistory.update(history => [...history, { role: 'model', text: response }]);
    this.isChatting.set(false);
  }

  // --- Help Bot Methods ---
  openHelpModal(): void {
    this.helpQuery.set('');
    this.helpResponse.set('');
    this.isGettingHelp.set(false);
    this.helpModal.nativeElement.showModal();
  }

  async submitHelpQuery(): Promise<void> {
    const query = this.helpQuery().trim();
    if (!query) return;

    this.isGettingHelp.set(true);
    this.helpResponse.set('');
    const response = await this.geminiService.getHelp(query);
    this.helpResponse.set(response);
    this.isGettingHelp.set(false);
  }

  // --- Correlation Methods ---
  onCountryChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.selectedCountry.set(selectElement.value);
    this.loadDataForCountry(selectElement.value);
  }

  private loadDataForCountry(country: string): void {
    this.isLoadingData.set(true);
    this.isAnalyzing.set(true);
    this.isPredicting.set(true);
    this.analysis.set('');
    this.stockPrediction.set('');
    this.dataService.getDataForCountry(country).subscribe(data => {
      this.countryData.set(data);
      this.isLoadingData.set(false);
    });
  }

  private async runAnalysis(country: string, data: CountryData): Promise<void> {
      this.isAnalyzing.set(true);
      const result = await this.geminiService.analyzeData(country, data);
      this.analysis.set(result);
      this.isAnalyzing.set(false);
  }

  private async runPrediction(country: string, data: CountryData): Promise<void> {
    this.isPredicting.set(true);
    const result = await this.geminiService.predictStockPrice(country, data);
    this.stockPrediction.set(result);
    this.isPredicting.set(false);
  }

  // --- Predictor Methods ---
  onStockChange(event: Event): void {
    const selectElement = event.target as HTMLSelectElement;
    this.selectedStock.set(selectElement.value);
    this.loadDataForStock(selectElement.value);
  }

  setPredictionPeriod(period: number): void {
    if (this.predictionPeriod() === period) return;
    this.predictionPeriod.set(period);
  }

  private loadDataForStock(ticker: string): void {
    this.isLoadingSingleStock.set(true);
    this.isPredictingSingleStock.set(true);
    this.singleStockPrediction.set('');
    this.dataService.getDataForStock(ticker).subscribe(data => {
        this.singleStockData.set(data);
        this.isLoadingSingleStock.set(false);
    });
  }

  private async runSingleStockPrediction(ticker: string, data: SingleStockData, period: number): Promise<void> {
    this.isPredictingSingleStock.set(true);
    const result = await this.geminiService.predictSingleStock(ticker, data, period);
    this.singleStockPrediction.set(result);
    this.isPredictingSingleStock.set(false);
  }

  // --- Charting Methods ---
  private updateCorrelationCharts(data: CountryData): void {
    if (!this.covidChartCanvas || !this.stockChartCanvas) return;

    const labels = data.covidData.map(d => d.date);
    
    // COVID Chart
    const covidCases = data.covidData.map(d => d.cases);
    const covidDeaths = data.covidData.map(d => d.deaths);
    if (this.covidChart) this.covidChart.destroy();
    this.covidChart = this.createChart(
      this.covidChartCanvas.nativeElement,
      labels,
      [
        { label: 'Daily Cases', data: covidCases, borderColor: '#f97316', backgroundColor: '#f9731633', fill: true },
        { label: 'Daily Deaths', data: covidDeaths, borderColor: '#ef4444', backgroundColor: '#ef444433', fill: true }
      ],
      'COVID-19 Trends'
    );

    // Stock Chart
    const stockPrices = data.stockData.map(d => d.value);
    if (this.stockChart) this.stockChart.destroy();
    this.stockChart = this.createChart(
        this.stockChartCanvas.nativeElement,
        labels,
        [{ label: data.stockIndexName, data: stockPrices, borderColor: '#3b82f6', backgroundColor: '#3b82f633', fill: true }],
        'Stock Market Performance'
    );
  }

  private updateSingleStockChart(data: SingleStockData): void {
    if (!this.singleStockChartCanvas) return;
    const labels = data.priceHistory.map(d => d.date);
    const stockPrices = data.priceHistory.map(d => d.value);
    
    if (this.singleStockChart) this.singleStockChart.destroy();
    
    this.singleStockChart = this.createChart(
      this.singleStockChartCanvas.nativeElement,
      labels,
      [{ label: `${data.stockName} (${this.selectedStock()})`, data: stockPrices, borderColor: '#22c55e', backgroundColor: '#22c55e33', fill: true }],
      'Historical Stock Price'
    );
  }

  // --- Common Methods ---
  changeTheme(event: Event) {
    const theme = (event.target as HTMLSelectElement).value;
    document.documentElement.setAttribute('data-theme', theme);
  }
  
  private createChart(canvas: HTMLCanvasElement, labels: string[], datasets: any[], title: string): any {
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--bc') || '#d1d5db';
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--b2') || '#4b5563';

    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets.map(ds => ({
          ...ds,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
            },
            zoom: {
              wheel: {
                enabled: true,
              },
              pinch: {
                enabled: true,
              },
              mode: 'x',
            },
          },
          legend: {
            labels: { color: textColor }
          },
          title: {
            display: true,
            text: title,
            color: textColor,
            font: { size: 16 }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'month' },
            ticks: { color: textColor },
            grid: { color: gridColor }
          },
          y: {
            ticks: { color: textColor },
            grid: { color: gridColor }
          }
        }
      }
    });
  }
}
