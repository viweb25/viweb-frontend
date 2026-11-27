export const LABEL_EXAMPLE = {
  project: 'Box label check',
  instruction: 'Check that the shipping label is straight and inside the marked area.',
  labels: [
    { name: 'Straight label', kind: 'good', hint: 'The label is straight and inside the marked area.' },
    { name: 'Crooked label', kind: 'defect', hint: 'The label is tilted or crosses the marked area.' },
  ],
} as const;
