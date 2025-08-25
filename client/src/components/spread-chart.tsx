import { useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface ChartDataPoint {
  t: string;
  p: number;
}

interface SpreadChartProps {
  data: ChartDataPoint[];
  zScore: number;
}

export default function SpreadChart({ data, zScore }: SpreadChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set up styles
    ctx.strokeStyle = '#F57C00'; // accent color
    ctx.fillStyle = 'rgba(245, 124, 0, 0.1)';
    ctx.lineWidth = 2;

    // Calculate data range
    const prices = data.map(d => d.p);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;

    // Draw price line
    ctx.beginPath();
    data.forEach((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point.p - minPrice) / priceRange) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    // Fill area under curve
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    // Draw line
    ctx.beginPath();
    data.forEach((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point.p - minPrice) / priceRange) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw threshold lines
    const drawThresholdLine = (value: number, color: string, dash: boolean = true) => {
      const normalizedValue = (value + 3) / 6; // Normalize z-score range -3 to 3
      const y = height - (normalizedValue * height);
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      if (dash) {
        ctx.setLineDash([5, 5]);
      }
      
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      
      ctx.setLineDash([]);
    };

    // Draw entry and exit thresholds
    drawThresholdLine(-2, '#4CAF50'); // Entry threshold
    drawThresholdLine(-1, '#F44336'); // Exit threshold

  }, [data, zScore]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={224}
      className="w-full h-full"
      data-testid="spread-chart"
    />
  );
}
