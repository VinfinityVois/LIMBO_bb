import { bootPage } from './core/boot';
import { bindAudioUnlock, bindSfxUi } from './core/audio';
import { bindCursor2d } from './ui/cursor2d';
import { bindReveals } from './ui/reveal';

bootPage('index');
bindAudioUnlock();
bindSfxUi();
bindCursor2d();
bindReveals();