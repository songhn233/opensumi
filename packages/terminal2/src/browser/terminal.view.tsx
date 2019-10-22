import * as React from 'react';
import { observer, useObservable } from 'mobx-react-lite';
import * as styles from './terminal.module.less';
import 'xterm/lib/xterm.css';
import 'xterm/lib/addons/fullscreen/fullscreen.css';
import { useInjectable } from '@ali/ide-core-browser';
import { ITerminalClient } from '../common';

export const TerminalView = observer(() => {
  const ref = React.useRef<HTMLElement | null>();
  const terminalClient: ITerminalClient = useInjectable(ITerminalClient);

  React.useEffect(() => {
    const terminalContainerEl = ref.current;
    if (terminalContainerEl) {
      terminalClient.setWrapEl(terminalContainerEl);
      // 创建第一个终端
      // terminalClient.createTerminal();
    }
  }, []);

  return (
    <div className={styles.terminal_wrapper}>
      <div className={styles.terminal_container} ref={(el) => { ref.current = el; }} />
    </div>
  );
});

export const TerminalToolbarView = observer(() => {
  const terminalClient: ITerminalClient = useInjectable(ITerminalClient);
  const termList = Array.from(terminalClient.termMap);

  return (
    <div className={styles.terminal_toolbar}>
      <select onChange={terminalClient.onSelectChange} value={terminalClient.activeId}>
        {termList.map((term, index) => {
          return (
            <option key={term[1].id} value={term[0]} >{`${index + 1}. ${term[1].name}`}</option>
          );
        })}
      </select>
    </div>
  );
});
