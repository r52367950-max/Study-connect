import { Injectable } from '@nestjs/common';

type Labels = Record<string, string | number | boolean | null | undefined>;

type HistogramState = {
  buckets: Map<number, number>;
  count: number;
  sum: number;
};

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly histograms = new Map<string, HistogramState>();

  increment(name: string, labels: Labels = {}, value = 1): void {
    const key = this.key(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + value);
  }

  setGauge(name: string, value: number, labels: Labels = {}): void {
    this.gauges.set(this.key(name, labels), value);
  }

  observe(name: string, seconds: number, labels: Labels = {}, buckets = DEFAULT_BUCKETS): void {
    const key = this.key(name, labels);
    let state = this.histograms.get(key);
    if (!state) {
      state = { buckets: new Map(buckets.map((bucket) => [bucket, 0])), count: 0, sum: 0 };
      this.histograms.set(key, state);
    }
    for (const bucket of state.buckets.keys()) {
      if (seconds <= bucket) state.buckets.set(bucket, (state.buckets.get(bucket) ?? 0) + 1);
    }
    state.count += 1;
    state.sum += seconds;
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    for (const [key, value] of this.counters) lines.push(`${key} ${value}`);
    for (const [key, value] of this.gauges) lines.push(`${key} ${value}`);
    for (const [key, state] of this.histograms) {
      for (const [bucket, value] of [...state.buckets.entries()].sort((a, b) => a[0] - b[0])) {
        lines.push(`${this.addLabel(this.withSuffix(key, '_bucket'), 'le', String(bucket))} ${value}`);
      }
      lines.push(`${this.addLabel(this.withSuffix(key, '_bucket'), 'le', '+Inf')} ${state.count}`);
      lines.push(`${this.withSuffix(key, '_count')} ${state.count}`);
      lines.push(`${this.withSuffix(key, '_sum')} ${state.sum}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private key(name: string, labels: Labels): string {
    const entries = Object.entries(labels)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) return name;
    return `${name}{${entries.map(([k, v]) => `${k}="${this.escapeLabel(String(v))}"`).join(',')}}`;
  }

  private withSuffix(metricKey: string, suffix: string): string {
    const labelStart = metricKey.indexOf('{');
    if (labelStart === -1) return `${metricKey}${suffix}`;
    return `${metricKey.slice(0, labelStart)}${suffix}${metricKey.slice(labelStart)}`;
  }

  private addLabel(metricKey: string, label: string, value: string): string {
    const labelText = `${label}="${this.escapeLabel(value)}"`;
    if (!metricKey.includes('{')) return `${metricKey}{${labelText}}`;
    return metricKey.replace(/}$/, `,${labelText}}`);
  }

  private escapeLabel(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}
