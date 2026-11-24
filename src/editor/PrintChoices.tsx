import { useI18n } from './i18n.js';
import type { Card } from '../shared/model.js';
import { Preview } from './Preview.js';

export function PrintChoices({ cards, choose }: { cards: Card[]; choose: (mode: 'sheet' | 'cards') => void }) {
  const { t } = useI18n();
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
      <strong id="choice-sheet">{t('printSheet')}</strong>
      <small id="choice-sheet-detail">{t('printSheetDetails')}</small>
    </button>
    <button className="print-choice" onClick={() => choose('cards')} aria-labelledby="choice-cards" aria-describedby="choice-cards-detail">
      <div className="choice-preview" aria-hidden="true">
        <div className="choice-cards">
          {spread.map((card, index) => <Preview key={index} card={card} />)}
        </div>
      </div>
      <strong id="choice-cards">{t('individualCards')}</strong>
      <small id="choice-cards-detail">{t('individualCardsDetails')}</small>
    </button>
  </div>;
}
