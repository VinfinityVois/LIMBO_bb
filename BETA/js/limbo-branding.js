(()=>{'use strict';
const logo='assets/img/log.png';
const link=document.createElement('link');link.rel='icon';link.type='image/png';link.href=logo;document.head.appendChild(link);
const apple=document.createElement('link');apple.rel='apple-touch-icon';apple.href=logo;document.head.appendChild(apple);
const brand=document.querySelector('.sc-brand');
if(brand&&!brand.querySelector('.limbo-brand-logo')){
 const img=document.createElement('img');img.className='limbo-brand-logo';img.src=logo;img.alt='LIMBO';img.width=30;img.height=30;
 const live=brand.querySelector('.live');if(live)live.insertAdjacentElement('afterend',img);else brand.prepend(img);
}
else if(!brand){
 const header=document.querySelector('header');
 if(header&&!header.querySelector('.limbo-page-logo')){
  const img=document.createElement('img');img.className='limbo-page-logo';img.src=logo;img.alt='LIMBO';img.width=34;img.height=34;
  const anchor=header.firstElementChild;
  if(anchor)anchor.insertAdjacentElement('afterbegin',img);else header.appendChild(img);
 }
}
})();