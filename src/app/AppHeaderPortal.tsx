import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const AppHeaderTargetContext = createContext<HTMLElement | null>(null);

export function AppHeaderTargetProvider({
  target,
  children,
}: {
  target: HTMLElement | null;
  children: ReactNode;
}) {
  return (
    <AppHeaderTargetContext.Provider value={target}>
      {children}
    </AppHeaderTargetContext.Provider>
  );
}

export function AppHeaderPortal({ children }: { children: ReactNode }) {
  const target = useContext(AppHeaderTargetContext);
  return target ? createPortal(children, target) : null;
}
