import type { Subject } from "@/lib/types";

// Directions shown before and during NMAT exams.
//
// Written for MEDprep. The CEM practice set these are modelled on carries a
// notice barring commercial redistribution, so none of its wording or examples
// are reproduced here — only the section structure, which is how the real test
// is organised.
//
// Keyed by subject slug rather than stored per exam, so every NMAT exam gets
// them automatically, including ones created later and students' own presets.

export type DirectionExample = { prompt: string; answer: string };

export type DirectionSection = {
  title: string;
  directions: string;
  example?: DirectionExample;
};

export type SubjectDirections = {
  slug: string;
  name: string;
  /** Shown when a subject has no sections (Part II). */
  summary?: string;
  sections: DirectionSection[];
};

export type PartDirections = {
  part: "I" | "II";
  title: string;
  general: string[];
  subjects: SubjectDirections[];
};

const PART_OF: Record<string, "I" | "II"> = {
  verbal: "I",
  "inductive-reasoning": "I",
  quantitative: "I",
  "perceptual-acuity": "I",
  biology: "II",
  physics: "II",
  "social-science": "II",
  chemistry: "II",
};

const GENERAL: Record<"I" | "II", { title: string; general: string[] }> = {
  I: {
    title: "Part I · Mental Ability",
    general: [
      "Every item is multiple choice. Pick the one best answer.",
      "Your answer saves as soon as you tap it, and you can change it until you submit.",
      "Keep scratch paper nearby and work without a calculator, the way you will on test day.",
      "This exam includes items from the sections below. Read the directions for each one before you start.",
    ],
  },
  II: {
    title: "Part II · Academic Proficiency",
    general: [
      "Every item is multiple choice. Pick the one best answer.",
      "Your answer saves as soon as you tap it, and you can change it until you submit.",
      "Keep scratch paper nearby and work without a calculator, the way you will on test day.",
    ],
  },
};

const SECTIONS: Record<string, Omit<SubjectDirections, "slug" | "name">> = {
  verbal: {
    sections: [
      {
        title: "Analogies",
        directions:
          "Each item is written A : B :: C : ___. Work out how the first two words are related, then choose the word that relates to the third word in the same way.",
        example: { prompt: "HOT : COLD :: UP : ___", answer: "down — opposites" },
      },
      {
        title: "Reading Comprehension",
        directions:
          "Each selection is a short passage followed by several questions. Read the passage, then answer using only what it states or clearly implies. Questions about the same passage come one after another.",
      },
    ],
  },
  "inductive-reasoning": {
    sections: [
      {
        title: "Figure Series",
        directions:
          "A row of figures changes step by step. Find the rule — turning, adding or removing parts, shading, moving — and choose the figure that comes next.",
      },
      {
        title: "Figure Grouping",
        directions:
          "Five figures are shown. Four share a feature the fifth does not. Choose the one that doesn't belong.",
      },
      {
        title: "Number and Letter Series",
        directions:
          "Find the rule behind the sequence of numbers or letters and choose what comes next.",
        example: { prompt: "3, 6, 12, 24, ___", answer: "48 — each term doubles" },
      },
    ],
  },
  quantitative: {
    sections: [
      {
        title: "Fundamental Operations",
        directions:
          "Work out or simplify the expression and choose the correct result. Arithmetic and basic algebra.",
        example: { prompt: "8 + 12 ÷ 4 × 2 = ___", answer: "14 — divide and multiply before adding" },
      },
      {
        title: "Problem Solving",
        directions:
          "Each item is a word problem. Set it up, solve it, and choose the answer.",
        example: {
          prompt: "A jeepney covers 60 km in 1.5 hours. At the same speed, how far does it go in 4 hours?",
          answer: "160 km",
        },
      },
      {
        title: "Data Interpretation",
        directions:
          "A table or graph is followed by several questions. Answer from the data shown; some need a quick calculation.",
      },
    ],
  },
  "perceptual-acuity": {
    sections: [
      {
        title: "Hidden Figure",
        directions:
          "A simple shape is shown beside five larger drawings. Choose the drawing that contains the simple shape. It may be turned, but it must keep the same shape and size.",
      },
      {
        title: "Mirror Image",
        directions:
          "Choose the option that is the mirror image of the given figure — flipped as if seen in a mirror, not simply rotated.",
      },
      {
        title: "Identical Information",
        directions:
          "A name and address, a reference entry, or a sentence is followed by several versions. Choose the one that matches it exactly: same words, order, spelling and punctuation.",
      },
    ],
  },
  biology: { summary: "Questions on Biology. There are no separate sections.", sections: [] },
  physics: { summary: "Questions on Physics. There are no separate sections.", sections: [] },
  "social-science": {
    summary: "Questions on Social Science. There are no separate sections.",
    sections: [],
  },
  chemistry: { summary: "Questions on Chemistry. There are no separate sections.", sections: [] },
};

/**
 * Directions for the subjects an exam covers, grouped by NMAT part.
 * Returns null when none of the subjects are NMAT, so PLE exams are untouched.
 */
export function nmatDirectionsFor(
  subjects: Pick<Subject, "slug" | "name" | "order" | "track">[]
): PartDirections[] | null {
  const parts: PartDirections[] = [];

  for (const s of [...subjects].sort((a, b) => a.order - b.order)) {
    if (s.track !== "nmat") continue;
    const part = PART_OF[s.slug];
    const content = SECTIONS[s.slug];
    if (!part || !content) continue;

    let group = parts.find((p) => p.part === part);
    if (!group) {
      group = { part, ...GENERAL[part], subjects: [] };
      parts.push(group);
    }
    group.subjects.push({ slug: s.slug, name: s.name, ...content });
  }

  parts.sort((a, b) => a.part.localeCompare(b.part));
  return parts.length > 0 ? parts : null;
}
