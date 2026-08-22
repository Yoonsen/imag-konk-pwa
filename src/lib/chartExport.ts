interface ChartLegendItem {
  label: string;
  color: string;
}

interface ChartExportOptions {
  title: string;
  legend?: ChartLegendItem[];
}

const loadSvgImage = (svg: SVGSVGElement): Promise<HTMLImageElement> => {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const blob = new Blob(
    [new XMLSerializer().serializeToString(clone)],
    { type: 'image/svg+xml;charset=utf-8' }
  );
  const url = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Kunne ikke klargjøre trendgrafen som bilde.'));
    };
    image.src = url;
  });
};

export async function downloadTrendChartJpeg(
  svg: SVGSVGElement,
  filename: string,
  { title, legend = [] }: ChartExportOptions
): Promise<void> {
  const viewBox = svg.viewBox.baseVal;
  const chartWidth = viewBox.width || 720;
  const chartHeight = viewBox.height || 260;
  const legendRows = legend.length > 4 ? 2 : legend.length > 0 ? 1 : 0;
  const headerHeight = 62 + legendRows * 28;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(chartWidth * scale);
  canvas.height = Math.ceil((chartHeight + headerHeight) * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Nettleseren kunne ikke opprette bildefilen.');

  context.scale(scale, scale);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, chartWidth, chartHeight + headerHeight);
  context.fillStyle = '#1f2928';
  context.font = '600 20px system-ui, sans-serif';
  context.fillText(title, 24, 34, chartWidth - 48);

  legend.forEach((item, index) => {
    const row = Math.floor(index / 4);
    const column = index % 4;
    const x = 24 + column * ((chartWidth - 48) / 4);
    const y = 66 + row * 28;
    context.fillStyle = item.color;
    context.beginPath();
    context.arc(x + 5, y - 5, 5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#394341';
    context.font = '13px system-ui, sans-serif';
    context.fillText(item.label, x + 16, y, (chartWidth - 48) / 4 - 22);
  });

  const image = await loadSvgImage(svg);
  context.drawImage(image, 0, headerHeight, chartWidth, chartHeight);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
