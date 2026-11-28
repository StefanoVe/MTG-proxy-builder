import { z } from 'zod';

export const pdfOptions = z.object({
  paper: z.enum(['A4', 'Letter']).default('A4'),
  cut: z.boolean().default(true),
  backs: z.boolean().default(true),
  bleed: z.enum(['none', 'mpc', 'custom']).default('none'),
  customMm: z.number().min(0).max(10).default(3),
  fill: z.enum(['mirror', 'solid', 'ambient']).default('mirror'),
  color: z.string().regex(/^#[a-f0-9]{6}$/i).default('#000000')
});

export const archiveOptions = z.object({
  format: z.enum(['png', 'jpg']).default('png'),
  dpi: z.union([z.literal(300), z.literal(600)]).default(300),
  quality: z.number().int().min(60).max(100).default(95),
  bleed: z.enum(['none', 'mpc', 'custom']).default('none'),
  customMm: z.number().min(0).max(10).default(3),
  fill: z.enum(['mirror', 'solid', 'ambient']).default('mirror'),
  color: z.string().regex(/^#[a-f0-9]{6}$/i).default('#000000'),
  backs: z.boolean().default(true),
  copies: z.boolean().default(false)
});

export type ExportRequest =
  | { format: 'pdf'; options: z.infer<typeof pdfOptions> }
  | { format: 'zip'; options: z.infer<typeof archiveOptions> };
