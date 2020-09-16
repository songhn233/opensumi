import * as React from 'react';
import * as cls from 'classnames';
import { observer } from 'mobx-react-lite';
import { ViewState, isUndefined, useInjectable, localize, DisposableCollection } from '@ali/ide-core-browser';
import { DebugThread } from '../../model/debug-thread';
import { RecycleList } from '@ali/ide-components';
import { DebugStackFrame } from '../../model';
import { IDebugSessionManager } from '../../../common';
import { DebugSessionManager } from '../../debug-session-manager';
import * as styles from './debug-call-stack.module.less';

export interface DebugStackSessionViewProps {
  frames: DebugStackFrame[];
  thread: DebugThread;
  viewState: ViewState;
  indent?: number;
}

export const DebugStackFramesView = observer((props: DebugStackSessionViewProps) => {
  const { viewState, frames, thread, indent = 0 } = props;
  const [selected, setSelected] = React.useState<number | undefined>();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [framesErrorMessage, setFramesErrorMessage] = React.useState<string>('');
  const [canLoadMore, setCanLoadMore] = React.useState<boolean>(false);
  const manager = useInjectable<DebugSessionManager>(IDebugSessionManager);

  const loadMore = async () => {
    if (!thread) {
      return;
    }
    const frames = await thread.fetchFrames();
    if (frames[0]) {
      const frame = frames[0];
      thread.currentFrame = frame;
      setSelected(frame.raw.id);
      if (frame && frame.source) {
        frame.source.open({}, frame);
      }
    }
  };

  React.useEffect(() => {
    const disposable = new DisposableCollection();

    disposable.push(manager.onDidChangeActiveDebugSession(({ previous }) => {
      if (previous && previous !== thread.session) {
        setSelected(undefined);
      }
    }));

    return () => {
      disposable.dispose();
    };
  }, []);

  React.useEffect(() => {
    if (manager.currentFrame) {
      setSelected(manager.currentFrame.raw.id);
    }
  }, [manager.currentFrame]);

  React.useEffect(() => {
    if (thread) {
      if (thread.stoppedDetails) {
        const { framesErrorMessage, totalFrames } = thread.stoppedDetails;
        setFramesErrorMessage(framesErrorMessage || '');
        if (totalFrames && totalFrames > thread.frameCount) {
          setCanLoadMore(true);
        } else {
          setCanLoadMore(false);
        }
      } else {
        setCanLoadMore(false);
      }
    } else {
      setCanLoadMore(false);
    }
  }, [frames]);

  const template = ({
    data,
  }) => {
    const frame: DebugStackFrame = data;
    const isLabel = frame.raw.presentationHint === 'label';
    const isSubtle = frame.raw.presentationHint === 'subtle';
    const clickHandler = () => {
      if (isLabel || isSubtle) {
        return;
      }
      manager.currentSession = frame.session;
      frame.session.currentThread = frame.thread;
      setSelected(frame.raw.id);
      if (frame && frame.source) {
        frame.source.open({}, frame);
      }
    };

    return <div
      style={ { paddingLeft: `${indent}px` } }
      className={ cls(
        styles.debug_stack_frames_item,
        selected === frame.raw.id && styles.selected,
        !(frame.raw && frame.raw.source && frame.raw.source.name) && styles.debug_stack_frames_item_hidden,
      ) }
      onClick={ clickHandler }>
      <span className={ cls(
        styles.debug_stack_frames_item_label,
        isLabel && styles.label,
        isSubtle && styles.subtle,
      ) }>
        { frame.raw && frame.raw.name }
      </span>
      <span className={ styles.debug_stack_frames_item_description }>
        { (frame.raw && frame.raw.source && frame.raw.source.name) || localize('debug.stack.frame.noSource') }
      </span>
      <div className={ cls(!isUndefined(frame.raw.line) && styles.debug_stack_frames_item_badge) }>
        { frame.raw && frame.raw.line }{ !isUndefined(frame.raw.line) && ':' }{ frame.raw && frame.raw.column }
      </div>
    </div>;
  };

  const renderLoadMoreStackFrames = () => {
    const clickHandler = async () => {
      setIsLoading(true);
      await loadMore();
      setIsLoading(false);
    };
    return <div className={ styles.debug_stack_frames_item } onClick={ clickHandler }>
      <span className={ styles.debug_stack_frames_load_more }>{ localize('debug.stack.loadMore') }</span>
    </div>;
  };

  const renderLoading = () => {
    return <div className={ styles.debug_stack_frames_item }>
      <span className={ styles.debug_stack_frames_load_more }>{ localize('debug.stack.loading') }</span>
    </div>;
  };

  const renderFramesErrorMessage = (message: string) => {
    return <div className={ styles.debug_stack_frames_item }>
      <span className={ styles.debug_stack_frames_error_message } title={ message }>{ message }</span>
    </div>;
  };

  if (framesErrorMessage) {
    return <div className={ styles.debug_stack_frames }>
      { renderFramesErrorMessage(framesErrorMessage) }
    </div>;
  }

  const footer = () => {
    if (isLoading) {
      return renderLoading();
    } else if (canLoadMore) {
      return renderLoadMoreStackFrames();
    }
    return null;
  };

  return (
    <RecycleList
      data={ frames }
      template={ template }
      itemHeight={ 22 }
      width = {viewState.width}
      height = { (isLoading || canLoadMore) ? (frames.length + 1) * 22 : frames.length * 22 }
      footer = { footer }
    />
  );
});