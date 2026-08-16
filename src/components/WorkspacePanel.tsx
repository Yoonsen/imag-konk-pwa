import type { ReactNode } from 'react';
import { Button, Heading } from '@digdir/designsystemet-react';

interface WorkspacePanelProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function WorkspacePanel({ title, children, onClose }: WorkspacePanelProps) {
  return (
    <aside
      id="workspace-panel"
      className="workspace-panel"
      aria-labelledby="workspace-panel-title"
    >
      <div className="workspace-panel__header">
        <Heading id="workspace-panel-title" level={2} data-size="sm">{title}</Heading>
        <Button
          type="button"
          variant="tertiary"
          data-size="sm"
          aria-label={`Lukk ${title.toLowerCase()}`}
          onClick={onClose}
        >
          Lukk
        </Button>
      </div>
      <div className="workspace-panel__content">{children}</div>
    </aside>
  );
}
