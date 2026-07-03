export interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  text?: string;
  file?: string;
}

export interface CanvasDocument {
  nodes: CanvasNode[];
  edges: unknown[];
}

export class CanvasService {
  addReviewCard(canvas: CanvasDocument, text: string): CanvasDocument {
    const lane = canvas.nodes.find((node) => node.type === 'group' && node.label === 'Stanley Review Lane');
    const baseX = lane?.x ?? 0;
    const baseY = lane?.y ?? 0;
    const existingReviewCards = canvas.nodes.filter((node) => node.id.startsWith('stanley-review-')).length;

    return {
      ...canvas,
      nodes: canvas.nodes.concat({
        id: `stanley-review-${existingReviewCards + 1}`,
        type: 'text',
        text,
        x: baseX + 24,
        y: baseY + 48 + existingReviewCards * 150,
        width: 420,
        height: 120,
      }),
    };
  }
}
