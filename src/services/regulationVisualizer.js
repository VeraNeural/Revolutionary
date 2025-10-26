const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const dayjs = require('dayjs');

class RegulationVisualizer {
    constructor() {
        this.chartJSNodeCanvas = new ChartJSNodeCanvas({
            width: 800,
            height: 400,
            backgroundColour: 'white'
        });
    }

    /**
     * Generate window of tolerance visualization
     */
    async createWindowOfToleranceChart(toleranceData) {
        const config = {
            type: 'line',
            data: {
                labels: toleranceData.map(d => dayjs(d.time_period.split(' to ')[0]).format('MMM D')),
                datasets: [{
                    label: 'Success Rate',
                    data: toleranceData.map(d => d.success_rate * 100),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Window of Tolerance Evolution'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Success Rate (%)'
                        }
                    }
                }
            }
        };

        return await this.chartJSNodeCanvas.renderToBuffer(config);
    }

    /**
     * Generate regulation patterns visualization
     */
    async createPatternsChart(patternData) {
        const config = {
            type: 'radar',
            data: {
                labels: patternData.map(p => p.pattern_type),
                datasets: [{
                    label: 'Confidence Level',
                    data: patternData.map(p => p.confidence_level * 100),
                    fill: true,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgb(75, 192, 192)',
                    pointBackgroundColor: 'rgb(75, 192, 192)'
                }]
            },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: 'Regulation Pattern Analysis'
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        };

        return await this.chartJSNodeCanvas.renderToBuffer(config);
    }

    /**
     * Generate progress overview visualization
     */
    async createProgressChart(progressData) {
        const config = {
            type: 'bar',
            data: {
                labels: progressData.map(d => d.evidence_type),
                datasets: [{
                    label: 'Total Instances',
                    data: progressData.map(d => d.total_count),
                    backgroundColor: 'rgba(75, 192, 192, 0.5)'
                }, {
                    label: 'Average Success',
                    data: progressData.map(d => d.avg_success * 100),
                    backgroundColor: 'rgba(153, 102, 255, 0.5)'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Regulation Progress Overview'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        };

        return await this.chartJSNodeCanvas.renderToBuffer(config);
    }

    /**
     * Generate baseline shifts visualization
     */
    async createBaselineShiftChart(baselineData) {
        // Transform baseline data into time series
        const timeSeriesData = this._transformBaselineData(baselineData);
        
        const config = {
            type: 'line',
            data: {
                labels: timeSeriesData.map(d => d.date),
                datasets: [{
                    label: 'Baseline State',
                    data: timeSeriesData.map(d => d.value),
                    borderColor: 'rgb(153, 102, 255)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Nervous System Baseline Evolution'
                    }
                }
            }
        };

        return await this.chartJSNodeCanvas.renderToBuffer(config);
    }

    /**
     * Transform baseline data for visualization
     */
    _transformBaselineData(baselineData) {
        return baselineData.map(record => ({
            date: dayjs(record.timestamp).format('MMM D'),
            value: this._calculateBaselineValue(record.baseline_state)
        }));
    }

    /**
     * Calculate numeric value for baseline state
     */
    _calculateBaselineValue(state) {
        const stateValues = {
            'highly_dysregulated': 0,
            'dysregulated': 25,
            'somewhat_regulated': 50,
            'regulated': 75,
            'highly_regulated': 100
        };
        return stateValues[state] || 50;
    }
}

module.exports = new RegulationVisualizer();