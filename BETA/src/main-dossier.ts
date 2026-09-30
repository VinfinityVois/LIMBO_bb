import { bootPage } from './core/boot';
import { bindAudioUnlock, bindSfxUi } from './core/audio';
import { bindReveals } from './ui/reveal';

bootPage('dossier');
bindAudioUnlock();
bindSfxUi();
bindReveals();