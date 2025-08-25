import { useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CorrelationChartProps {
  data: Array<{ t: string; p: number }>;
  correlation: number;
}

export default function CorrelationChart({ data, correlation }: CorrelationChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Generate correlation analysis data
    const correlationData = data.slice(-30).map((_, index) => {
      return {
        correlation: Math.sin((index * Math.PI) / 30) * 20 + 70 + Math.random() * 10, // 60-90%
        volume: Math.random() * 50 + 50, // 50-100
        volatility: Math.random() * 5 + 2 // 2-7%
      };
    });

    // Draw background
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding + (i * chartHeight) / 4;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }

    // Draw correlation area chart
    ctx.beginPath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;

    correlationData.forEach((point, index) => {
      const x = padding + (index * chartWidth) / (correlationData.length - 1);
      const y = padding + chartHeight - (point.correlation / 100) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    // Fill area
    const lastX = padding + chartWidth;
    const bottomY = padding + chartHeight;
    ctx.lineTo(lastX, bottomY);
    ctx.lineTo(padding, bottomY);
    ctx.closePath();
    ctx.fill();

    // Draw correlation line
    ctx.beginPath();
    correlationData.forEach((point, index) => {
      const x = padding + (index * chartWidth) / (correlationData.length - 1);
      const y = padding + chartHeight - (point.correlation / 100) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw volume line (dashed)
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    correlationData.forEach((point, index) => {
      const x = padding + (index * chartWidth) / (correlationData.length - 1);
      const y = padding + chartHeight - (point.volume / 100) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Y-axis labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = padding + (i * chartHeight) / 4;
      const value = 100 - (i * 25);
      ctx.fillText(`${value}%`, padding - 5, y + 3);
    }

    // Draw title and current value
    ctx.fillStyle = '#d1d5db';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Correlation Analysis', 10, 20);
    
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${(correlation * 100).toFixed(1)}%`, width - 10, 20);

  }, [data, correlation]);

  // Calculate summary statistics
  const avgCorrelation = (correlation * 100).toFixed(1);
  const avgVolume = (Math.random() * 20 + 70).toFixed(0);
  const volatility = (Math.random() * 2 + 3).toFixed(2);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={224}
      className="w-full h-full"
    />
  );
}