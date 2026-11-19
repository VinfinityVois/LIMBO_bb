(() => {
  'use strict';
  const names = {
    paper_lantern_shard:'Осколок фонаря', mirror_shard:'Зеркальный осколок',
    mirror_shard_before_fire:'Осколок зеркала · до пожара', mirror_shard_after_fire:'Осколок зеркала · после пожара',
    mirror_lens:'Сшитая зеркальная линза', wet_key_half:'Половина ключа · А', wet_key_other:'Половина ключа · Б',
    ryokan_key:'Ключ рёкана', kokeshi_note:'Записка кокэси', silk_thread:'Шёлковая нить',
    matchbox:'Спичечный коробок', medicinal_herbs:'Горькие травы', copper_bell:'Медный колокольчик',
    herbal_poultice:'Травяная повязка', warding_charm:'Тихий оберег', ember_lantern:'Тлеющий фонарь',
    black_seed:'Чёрное семя', stitched_mask:'Сшитая маска'
  };
  const recipes = [
    ['wet_key_half','wet_key_other','ryokan_key'],
    ['medicinal_herbs','silk_thread','herbal_poultice'],
    ['paper_lantern_shard','silk_thread','warding_charm'],
    ['paper_lantern_shard','matchbox','ember_lantern'],
    ['mirror_shard_before_fire','mirror_shard_after_fire','mirror_lens'],
    ['mirror_shard','silk_thread','mirror_lens']
  ];
  const effects = {
    herbal_poultice:'Восстанавливает 25 HP; после применения расходуется.',
    warding_charm:'Восстанавливает 20 единиц рассудка; после применения расходуется.',
    ember_lantern:'Переключает источник света; при использовании может привлечь существо. Также восстанавливает 12 единиц рассудка при применении как предмет.',
    stitched_mask:'Надеть / снять. Ношение влияет на восприятие и постепенно расходует рассудок.',
    black_seed:'Опасная находка: снижает рассудок при поднятии и продолжает оказывать давление, пока находится при тебе.',
    kokeshi_note:'Прочитанная записка сохраняется в личном деле и открывает подсказки о ключах.',
    ryokan_key:'Подходит к замку генкана.',
    matchbox:'Компонент синтеза с осколком бумажного фонаря.',
    medicinal_herbs:'Сырьё для травяной повязки.',
    silk_thread:'Компонент нескольких рецептов синтеза.'
  };
  const classify = id => id === 'kokeshi_note' ? 'ЗАПИСЬ / УЛИКА' :
    ['black_seed','stitched_mask','mirror_shard','mirror_shard_before_fire','mirror_shard_after_fire','mirror_lens'].includes(id) ? 'РЕЛИКТ / АНОМАЛИЯ' :
    ['herbal_poultice','warding_charm','ember_lantern'].includes(id) ? 'ПРЕДМЕТ ПРИМЕНЕНИЯ' :
    ['wet_key_half','wet_key_other','ryokan_key','copper_bell'].includes(id) ? 'ИНСТРУМЕНТ / КЛЮЧ' : 'КОМПОНЕНТ';
  const safe = value => String(value || '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  function itemId(title, image) {
    const src = image?.getAttribute('src') || '';
    const fromPath = Object.keys(names).find(id => src.toLowerCase().includes(id));
    if (fromPath) return fromPath;
    return Object.keys(names).find(id => names[id].toLowerCase() === String(title).trim().toLowerCase()) || '';
  }
  function enhance(modal) {
    if (!modal.classList.contains('open')) return;
    const panel = modal.querySelector('.sim-modal-panel');
    const titleNode = modal.querySelector('#modalTitle');
    const body = modal.querySelector('#modalBody');
    const visual = modal.querySelector('#modalVisual');
    const actions = modal.querySelector('#modalActions');
    if (!panel || !titleNode || !body || !visual || !actions) return;
    const title = titleNode.textContent || 'ОБЪЕКТ';
    const image = visual.querySelector('img');
    const id = itemId(title, image);
    if (!id) return;
    const description = body.textContent.replace(new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\s*'), '').trim();
    modal.classList.add('item-inspection-mode');
    const row = modal.querySelector('.smp-body-row');
    row?.classList.add('item-inspection-layout');
    const existing = body.querySelector('.item-dossier-content');
    if (existing) return;
    body.textContent = '';
    const content = document.createElement('div');
    content.className = 'item-dossier-content';
    const kicker = document.createElement('div');
    kicker.className = 'item-dossier-kicker';
    kicker.innerHTML = '<span class="item-dossier-chip">ARCHIVE_ENTRY // RK-01</span><span class="item-dossier-chip">' + safe(classify(id)) + '</span><span class="item-dossier-chip">В ИНВЕНТАРЕ</span>';
    const heading = document.createElement('h2');
    heading.className = 'item-dossier-heading';
    heading.textContent = title;
    const desc = document.createElement('p');
    desc.className = 'item-dossier-desc';
    desc.textContent = description || 'В архиве нет дополнительного описания объекта.';
    content.append(kicker, heading, desc);
    const props = document.createElement('section');
    props.className = 'item-dossier-section';
    props.innerHTML = '<h3>СВОЙСТВА И ПРИМЕНЕНИЕ</h3>';
    const prop = (label, value) => {
      const line = document.createElement('div');
      line.className = 'item-dossier-property';
      const a = document.createElement('span'); a.textContent = label;
      const b = document.createElement('span'); b.textContent = value;
      line.append(a,b); props.appendChild(line);
    };
    prop('Классификация', classify(id));
    prop('Состояние', id === 'stitched_mask' && document.body.classList.contains('mask-worn') ? 'НАДЕТА' : 'Обнаружен · доступен для осмотра');
    if (effects[id]) prop('Эффект', effects[id]);
    if (id === 'paper_lantern_shard') prop('Примечание', 'Бумага пропитана дождём; надпись внутри можно сопоставить с другими уликами.');
    if (id === 'copper_bell') prop('Примечание', 'Колокольчик без язычка; его можно использовать в событиях сектора.');
    content.appendChild(props);
    const possible = recipes.filter(recipe => recipe.includes(id));
    const section = document.createElement('section');
    section.className = 'item-dossier-section';
    const sectionTitle = document.createElement('h3'); sectionTitle.textContent = 'ВОЗМОЖНЫЕ КОМБИНАЦИИ';
    section.appendChild(sectionTitle);
    if (possible.length) {
      possible.forEach(recipe => {
        const other = recipe[0] === id ? recipe[1] : recipe[0];
        const card = document.createElement('div');
        card.className = 'item-dossier-recipe';
        const copy = document.createElement('div');
        const strong = document.createElement('strong'); strong.textContent = names[recipe[2]];
        const small = document.createElement('small'); small.textContent = names[id] + ' + ' + names[other];
        copy.append(strong,small);
        const status = document.createElement('b');
        status.textContent = 'РЕЦЕПТ';
        card.append(copy,status);
        section.appendChild(card);
      });
    } else {
      const empty = document.createElement('p'); empty.className = 'item-dossier-empty';
      empty.textContent = 'Известных комбинаций для этого предмета пока нет.';
      section.appendChild(empty);
    }
    content.appendChild(section);
    body.appendChild(content);
    const note = modal.querySelector('#modalNote');
    if (note) { note.textContent = 'ДАННЫЕ СЕКТОРА · RK-01'; note.style.display = 'none'; }
    if (!actions.querySelector('[data-inspection-use]') && ['herbal_poultice','warding_charm','ember_lantern','stitched_mask'].includes(id)) {
      const use = document.createElement('button');
      use.type = 'button'; use.dataset.inspectionUse = '1'; use.className = 'primary'; use.textContent = id === 'stitched_mask' ? (document.body.classList.contains('mask-worn') ? 'СНЯТЬ МАСКУ' : 'НАДЕТЬ МАСКУ') : 'ПРИМЕНИТЬ ПРЕДМЕТ';
      use.addEventListener('click', () => document.getElementById('btnUseItem')?.click());
      actions.insertBefore(use, actions.firstChild);
    }
    if (!actions.querySelector('[data-inspection-close]')) {
      const close = actions.querySelector('button');
      if (close) close.dataset.inspectionClose = '1';
    }
    if (image) {
      const stage = visual;
      if (!stage.dataset.parallaxBound) {
        stage.dataset.parallaxBound = '1';
        stage.addEventListener('pointermove', event => {
          const rect = stage.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - .5;
          const y = (event.clientY - rect.top) / rect.height - .5;
          image.style.transform = 'perspective(900px) rotateY(' + (x * 18) + 'deg) rotateX(' + (-y * 18) + 'deg) scale(1.035)';
        });
        stage.addEventListener('pointerleave', () => { image.style.transform = ''; });
      }
    }
  }
  const start = () => {
    const modal = document.getElementById('simModal');
    if (!modal) return;
    const observer = new MutationObserver(() => {
      if (modal.classList.contains('open')) requestAnimationFrame(() => enhance(modal));
      else modal.classList.remove('item-inspection-mode');
    });
    observer.observe(modal, {attributes:true,attributeFilter:['class']});
    const close = modal.querySelector('#modalClose');
    close?.addEventListener('click', () => modal.classList.remove('item-inspection-mode'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();