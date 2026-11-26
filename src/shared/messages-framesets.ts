/** Italian and English strings for the framesets frame-editing work. Keys here may override base wording. */
export const framesetsMessages = {
  setPngHelp: ["Basta un’immagine; per ogni colore puoi caricarne una diversa. Usa PNG trasparenti con le stesse proporzioni.", "One image is enough; you can load a different one for each color. Use transparent PNGs with the same proportions."],
  dropFrameImages: ["Trascina qui le immagini (una per colore)", "Drop the images here (one per color)"],
  dropFrameImagesHelp: ["Riconosce i nomi: white, blue, black, red, green, colorless (anche in italiano)", "Recognizes the names: white, blue, black, red, green, colorless (Italian names too)"],
  unmatchedFrameFiles: ["Non riconosciute: {names}. Usa i pulsanti dei singoli colori.", "Not recognized: {names}. Use the individual color buttons."],
  frameSetMissingColorless: ["Mancano: {colors}. Useranno l’immagine Incolore.", "Missing: {colors}. They will use the colorless image."],
  frameSetMissingFirst: ["Mancano: {colors}. Useranno la prima immagine disponibile.", "Missing: {colors}. They will use the first available image."],
  frameSetNeedsImage: ["Aggiungi un nome e almeno un’immagine.", "Add a name and at least one image."],
  usesColorless: ["Usa Incolore", "Uses colorless"],
  usesFirstAvailable: ["Usa la prima disponibile", "Uses the first available"],
  removeImage: ["Rimuovi", "Remove"],
  removeFrameColor: ["Rimuovi {color}", "Remove {color}"],
  applySelectedOne: ["Applica alla carta selezionata", "Apply to the selected card"],
  applySelectedCount: ["Applica alle {count} carte selezionate", "Apply to the {count} selected cards"],
  applyDeckOne: ["Applica alla carta del mazzo", "Apply to the card in the deck"],
  applyDeckCount: ["Applica a tutte le {count} carte del mazzo", "Apply to all {count} cards in the deck"],
} as const;
