import { createRef, type RefObject } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PanelRail, type WorkspacePanelId } from './PanelRail';

const buttonRefs: Record<WorkspacePanelId, RefObject<HTMLButtonElement>> = {
  corpus: createRef<HTMLButtonElement>(),
  parameters: createRef<HTMLButtonElement>(),
  export: createRef<HTMLButtonElement>(),
  help: createRef<HTMLButtonElement>()
};

describe('PanelRail', () => {
  it('marks only the active panel trigger as expanded', () => {
    const { rerender } = render(
      <PanelRail
        activePanel="corpus"
        documentCount={22946}
        exportCount={null}
        buttonRefs={buttonRefs}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Subkorpus/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Eksport/ })).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <PanelRail
        activePanel="export"
        documentCount={22946}
        exportCount={1044}
        buttonRefs={buttonRefs}
        onToggle={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Subkorpus/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Eksport/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('reports which panel the user selected', () => {
    const onToggle = vi.fn();
    render(
      <PanelRail
        activePanel={null}
        documentCount={22946}
        exportCount={null}
        buttonRefs={buttonRefs}
        onToggle={onToggle}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Parametre/ }));
    expect(onToggle).toHaveBeenCalledWith('parameters');
  });
});
