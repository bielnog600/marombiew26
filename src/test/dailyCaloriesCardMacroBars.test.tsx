import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import DailyCaloriesCard from '@/components/diet/DailyCaloriesCard';

const bars = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('div[style*="width"]')).filter((el) =>
    /bg-chart-/.test(el.className),
  );

const renderCard = (props: Partial<React.ComponentProps<typeof DailyCaloriesCard>> = {}) =>
  render(
    <DailyCaloriesCard
      consumed={500}
      target={1000}
      protein={{ current: 50, target: 100 }}
      carbs={{ current: 50, target: 100 }}
      fats={{ current: 25, target: 100 }}
      {...props}
    />,
  );

describe('MICRO-HOTFIX — barras de macro', () => {
  it('A — proteína 50/100 preenche 50%', () => {
    const { container } = renderCard();
    expect(bars(container)[0].style.width).toBe('50%');
  });

  it('B — carboidrato 50/100 preenche 50%', () => {
    const { container } = renderCard();
    expect(bars(container)[1].style.width).toBe('50%');
  });

  it('C — gordura 25/100 preenche 25%', () => {
    const { container } = renderCard();
    expect(bars(container)[2].style.width).toBe('25%');
  });

  it('D — carboidrato usa a classe explícita bg-chart-3', () => {
    const { container } = renderCard();
    expect(bars(container)[1].className).toContain('bg-chart-3');
  });

  it('E — gordura usa a classe explícita bg-chart-5', () => {
    const { container } = renderCard();
    expect(bars(container)[2].className).toContain('bg-chart-5');
  });

  it('F — proteína usa a classe explícita bg-chart-2', () => {
    const { container } = renderCard();
    expect(bars(container)[0].className).toContain('bg-chart-2');
  });

  it('G — meta 0 mantém a barra em 0%', () => {
    const { container } = renderCard({ carbs: { current: 30, target: 0 } });
    expect(bars(container)[1].style.width).toBe('0%');
  });

  it('H — consumo acima da meta limita em 100%', () => {
    const { container } = renderCard({ fats: { current: 300, target: 100 } });
    expect(bars(container)[2].style.width).toBe('100%');
  });
});
