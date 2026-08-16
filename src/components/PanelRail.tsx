import type { ComponentType, RefObject, SVGProps } from 'react';
import {
  ArchiveIcon,
  CogIcon,
  DownloadIcon,
  QuestionmarkCircleIcon
} from '@navikt/aksel-icons';

export type WorkspacePanelId = 'corpus' | 'parameters' | 'export' | 'help';

interface PanelRailProps {
  activePanel: WorkspacePanelId | null;
  documentCount: number;
  exportCount: number | null;
  buttonRefs: Record<WorkspacePanelId, RefObject<HTMLButtonElement>>;
  onToggle: (panel: WorkspacePanelId) => void;
}

interface RailItem {
  id: WorkspacePanelId;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: string;
}

export function PanelRail({
  activePanel,
  documentCount,
  exportCount,
  buttonRefs,
  onToggle
}: PanelRailProps) {
  const items: RailItem[] = [
    {
      id: 'corpus',
      label: 'Subkorpus',
      icon: ArchiveIcon,
      badge: documentCount.toLocaleString('nb-NO')
    },
    { id: 'parameters', label: 'Parametre', icon: CogIcon },
    {
      id: 'export',
      label: 'Eksport',
      icon: DownloadIcon,
      badge: exportCount === null ? undefined : exportCount.toLocaleString('nb-NO')
    },
    { id: 'help', label: 'Hjelp', icon: QuestionmarkCircleIcon }
  ];

  return (
    <nav className="panel-rail" aria-label="Verktøy">
      {items.map(({ id, label, icon: Icon, badge }) => {
        const isActive = activePanel === id;
        return (
          <button
            key={id}
            ref={buttonRefs[id]}
            type="button"
            className="panel-rail__button"
            data-active={isActive || undefined}
            aria-expanded={isActive}
            aria-controls="workspace-panel"
            onClick={() => onToggle(id)}
          >
            <Icon className="panel-rail__icon" aria-hidden />
            <span>{label}</span>
            {badge ? <small>{badge}</small> : null}
          </button>
        );
      })}
    </nav>
  );
}
