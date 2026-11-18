(() => {
  const links = [
    ['terminal.html','Камеры рекурсии'],
    ['scenes.html','Архив сцен'],
    ['employee.html','Профиль сотрудника'],
    ['dossier.html','Досье субъектов'],
    ['polygon.html','Полигон']
  ];
  const current = location.pathname.split('/').pop() || 'index.html';
  if (document.querySelector('.limbo-mobile-menu-button')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'limbo-mobile-menu-button';
  button.setAttribute('aria-label','Открыть меню');
  button.setAttribute('aria-expanded','false');
  button.innerHTML = '<span class="burger-lines" aria-hidden="true"><i></i><i></i><i></i></span><span>МЕНЮ</span>';
  const menu = document.createElement('nav');
  menu.className = 'limbo-mobile-menu';
  menu.setAttribute('aria-label','Навигация LIMBO');
  const caption = document.createElement('div');
  caption.className = 'menu-caption';
  caption.textContent = 'П.Р.И.Н.Ц. // НАВИГАЦИЯ';
  menu.appendChild(caption);
  links.forEach(([href,label]) => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    if (href === current) a.setAttribute('aria-current','page');
    menu.appendChild(a);
  });
  const header = document.querySelector('header');
  if (header) header.appendChild(button);
  else document.body.appendChild(button);
  document.body.appendChild(menu);
  const close = () => {
    button.setAttribute('aria-expanded','false');
    menu.classList.remove('is-open');
    document.body.classList.remove('limbo-menu-open');
  };
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded',String(open));
    menu.classList.toggle('is-open',open);
    document.body.classList.toggle('limbo-menu-open',open);
  });
  document.addEventListener('pointerdown', event => {
    if (!menu.contains(event.target) && !button.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => { if(event.key === 'Escape') close(); });
  menu.addEventListener('click', event => { if(event.target.closest('a')) close(); });
})();
