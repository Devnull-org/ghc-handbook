import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const chapters = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/chapters' }),
  schema: z.object({
    title: z.string(),
    /** One line shown in the chapter list and as the page's standfirst. */
    summary: z.string(),
    /** Ordering within the handbook. */
    order: z.number(),
    /** Which pipeline phase(s) this chapter covers, by id from src/data/pipeline.ts. */
    phases: z.array(z.string()).default([]),
    /** Primary source files this chapter is about. */
    sources: z
      .array(z.object({ file: z.string(), blurb: z.string() }))
      .default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { chapters };
