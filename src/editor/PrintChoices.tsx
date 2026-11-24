import type { Card } from '../shared/model.js';
import { Preview } from './Preview.js';

export function PrintChoices({ cards, choose }: { cards: Card[]; choose: (mode: 'sheet' | 'cards') => void }) {
  const sheet: Card[] = [];
  for (const card of cards) {
    const count = Math.min(card.count, 9 - sheet.length);
    sheet.push(...Array<Card>(count).fill(card));
  }
  const sample = cards.slice(0, 3);
  const spread = sample.length ? Array.from({ length: 3 }, (_, index) => sample[index % sample.length]) : [];
  return <div className="print-choices">
    <button className="print-choice" onClick={() => choose('sheet')} aria-labelledby="choice-sheet" aria-describedby="choice-sheet-detail">
      <div className="choice-preview" aria-hidden="true">
        <div className="choice-paper">
          {sheet.map((card, index) => <Preview key={index} card={card} />)}
        </div>
      </div>
      <strong id="choice-sheet">Foglio di stampa</strong>
      <small id="choice-sheet-detail">PDF A4 o Letter, con più carte per pagina</small>
    </button>
    <button className="print-choice" onClick={() => choose('cards')} aria-labelledby="choice-cards" aria-describedby="choice-cards-detail">
      <div className="choice-preview" aria-hidden="true">
        <div className="choice-cards">
          {spread.map((card, index) => <Preview key={index} card={card} />)}
        </div>
      </div>
      <strong id="choice-cards">Carte singole</strong>
      <small id="choice-cards-detail">Immagini PNG o JPG, con abbondanza opzionale</small>
    </button>
  </div>;
}
