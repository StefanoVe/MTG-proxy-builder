/** Italian and English strings for the picker frame-editing work. Keys here may override base wording. */
export const pickerMessages = {
  projectCardStyle: ["Stile delle carte", "Card style"],
  uploadPngFrame: ["Carica una cornice PNG…", "Upload a PNG frame…"],
  matchArtByName: ["Abbina le illustrazioni per nome file", "Match artwork by file name"],
  oneFrameForAll: ["Usa la stessa cornice su tutte", "Use the same frame for all"],
  batchMode: ["Cosa vuoi fare", "What to do"],
  batchFrameToApply: ["Cornice da applicare", "Frame to apply"],
  batchSharedFrameNote: ["Il mazzo ha uno stile comune: queste carte useranno invece la cornice scelta qui.", "The deck has a shared style: these cards will use the frame chosen here instead."],
  batchSkipEditedFramesOne: ["Salta 1 carta con la cornice già modificata", "Skip 1 card with an edited frame"],
  batchSkipEditedFrames: ["Salta {count} carte con la cornice già modificata", "Skip {count} cards with an edited frame"],
} as const;
