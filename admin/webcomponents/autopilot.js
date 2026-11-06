import{Fragment as e,jsx as t,jsxs as n,createRoot as r}from"../../../lib/esm/react-19.js";var i=`iob-dialog-close`;function a(e){return!!e.form}var o=[`header`,`staticText`,`divider`];function s(e,t){return e==null?``:typeof e==`object`?e[t]||e.en||Object.values(e).find(e=>!!e)||``:String(e)}function c(e){let t={};for(let[n,r]of Object.entries(e.items||{}))r&&!o.includes(r.type)&&(t[n]=r.type);return t}function l(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?e.toString():JSON.stringify(e)}function u(e,t){if(t!=null)switch(e){case`number`:case`slider`:{if(typeof t==`number`)return Number.isFinite(t)?t:void 0;let e=l(t).trim().replace(`,`,`.`);if(!e)return;let n=Number(e);return Number.isFinite(n)?n:void 0}case`checkbox`:return t===!0||t===`true`||t===1||t===`1`;default:return l(t)}}function d(e,t){let n={};for(let[r,i]of Object.entries(e)){let e=u(i,t[r]);e!==void 0&&(n[r]=e)}return n}var f=`"Roboto", "Helvetica", "Arial", sans-serif`,p=Object.freeze({type:`light`,primary:`#3399CC`,primaryContrast:`#FFFFFF`,secondary:`#164477`,secondaryContrast:`#FFFFFF`,background:`#FFFFFF`,paper:`#FFFFFF`,text:`rgba(0, 0, 0, 0.87)`,textSecondary:`rgba(0, 0, 0, 0.6)`,divider:`rgba(0, 0, 0, 0.12)`,error:`#D32F2F`,warning:`#ED6C02`,info:`#0288D1`,success:`#2E7D32`,fontFamily:f,fontSize:14,borderRadius:4}),m=Object.freeze({type:`dark`,primary:`#4DABF5`,primaryContrast:`rgba(0, 0, 0, 0.87)`,secondary:`#436A93`,secondaryContrast:`#FFFFFF`,background:`#121212`,paper:`#121212`,text:`#FFFFFF`,textSecondary:`rgba(255, 255, 255, 0.7)`,divider:`rgba(255, 255, 255, 0.12)`,error:`#F44336`,warning:`#FFA726`,info:`#29B6F6`,success:`#66BB6A`,fontFamily:f,fontSize:14,borderRadius:4}),h=[`primary`,`primaryContrast`,`secondary`,`secondaryContrast`,`background`,`paper`,`text`,`textSecondary`,`divider`,`error`,`warning`,`info`,`success`,`fontFamily`],g=[`fontSize`,`borderRadius`];function _(e){return{...e===`dark`?m:p}}function v(e){if(!e||typeof e!=`object`)return _(typeof e==`string`?e:`light`);let t=e,n=_(typeof t.type==`string`?t.type:`light`);for(let e of h){let r=t[e];typeof r==`string`&&r.trim()&&(n[e]=r.trim())}for(let e of g){let r=t[e],i=typeof r==`string`?parseFloat(r):r;typeof i==`number`&&Number.isFinite(i)&&i>=0&&(n[e]=i)}return n}function y(e,t){return e.type===t.type&&h.every(n=>e[n]===t[n])&&g.every(n=>e[n]===t[n])}function b(e){return`--iob-${e.replace(/[A-Z]/g,e=>`-${e.toLowerCase()}`)}`}function x(e){let t={};for(let n of h)t[b(n)]=e[n];for(let n of g)t[b(n)]=`${e[n]}px`;return t[`color-scheme`]=e.type,t}var S={ok:{en:`OK`,"zh-cn":`确定`},cancel:{en:`Cancel`,de:`Abbrechen`,ru:`Отмена`,pt:`Cancelar`,nl:`Annuleren`,fr:`Annuler`,it:`Annulla`,es:`Cancelar`,pl:`Anuluj`,uk:`Скасувати`,"zh-cn":`取消`},close:{en:`Close`,de:`Schließen`,ru:`Закрыть`,pt:`Fechar`,nl:`Sluiten`,fr:`Fermer`,it:`Chiudi`,es:`Cerrar`,pl:`Zamknij`,uk:`Закрити`,"zh-cn":`关闭`}},ee=`
dialog {
    box-sizing: border-box;
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 0;
    border-radius: calc(var(--iob-border-radius) * 2);
    background: var(--iob-paper);
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
/* as the dialogs of MUI: a dark paper gets lighter the higher it lies */
dialog.dark { background-image: linear-gradient(rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.16)); }
dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
dialog:focus { outline: none; }
form { display: flex; flex-direction: column; height: 100%; max-height: inherit; margin: 0; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 8px 12px 16px; font-size: 1.15em; font-weight: 500; }
header span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.body { flex: 1; min-height: 0; padding: 0 16px 16px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px 16px; }
button { font: inherit; padding: 6px 16px; border-radius: var(--iob-border-radius); border: 1px solid var(--iob-primary); background: transparent; color: var(--iob-primary); cursor: pointer; }
button.primary { background: var(--iob-primary); color: var(--iob-primary-contrast); }
button.close { border: 0; padding: 2px 8px; font-size: 1.4em; line-height: 1; color: var(--iob-text-secondary); }
label { display: flex; flex-direction: column; gap: 4px; }
label.check { flex-direction: row; align-items: center; gap: 8px; }
input, select, textarea { font: inherit; accent-color: var(--iob-primary); }
.help { color: var(--iob-text-secondary); font-size: 0.85em; }
h3 { margin: 4px 0 0; font-size: 1em; }
p { margin: 0; }
hr { width: 100%; border: 0; border-top: 1px solid var(--iob-divider); margin: 0; }
[hidden] { display: none !important; }
`;function C(e){if(!e)return null;try{let t=Function(`data`,`return (${e});`);return e=>{try{return!!t(e)}catch{return!1}}}catch{return null}}function w(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?String(e):``}function te(e){let{input:t,setting:n}=e;if(t)return t instanceof HTMLInputElement&&t.type===`checkbox`?t.checked:t instanceof HTMLSelectElement?n.options?.[t.selectedIndex]?.value:t.value}function ne(e,t,n,r,i){let a={name:t,setting:n,box:e.createElement(`div`),hidden:C(n.hidden),disabled:C(n.disabled)},o=s(n.label,i);switch(n.type){case`header`:return a.box=e.createElement(`h3`),a.box.textContent=s(n.text,i)||o,a;case`staticText`:return a.box=e.createElement(`p`),a.box.textContent=s(n.text,i)||o,a;case`divider`:return a.box=e.createElement(`hr`),a}let c=e.createElement(`label`);a.box=c;let l=e.createElement(`span`);if(l.textContent=o||t,n.type===`checkbox`){let t=e.createElement(`input`);t.type=`checkbox`,t.checked=r===!0||r===`true`,c.className=`check`,c.append(t,l),a.input=t}else if(n.type===`select`){let t=e.createElement(`select`);for(let r of n.options||[]){let n=e.createElement(`option`);n.textContent=s(r.label,i),t.append(n)}let o=(n.options||[]).findIndex(e=>String(e.value)===w(r));t.selectedIndex=o===-1?0:o,c.append(l,t),a.input=t}else if(n.type===`text`&&(n.minRows||1)>1){let t=e.createElement(`textarea`);t.rows=n.minRows||2,t.value=w(r),c.append(l,t),a.input=t}else{let t=e.createElement(`input`),i=w(r);switch(n.type){case`number`:case`slider`:t.type=n.type===`slider`?`range`:`number`,n.min!==void 0&&(t.min=String(n.min)),n.max!==void 0&&(t.max=String(n.max)),t.step=n.step===void 0?`any`:String(n.step);break;case`password`:t.type=`password`;break;case`color`:t.type=!i||/^#[0-9a-f]{6}$/i.test(i)?`color`:`text`;break;default:t.type=`text`}if(t.value=i,t.type===`range`){let n=e.createElement(`output`);n.textContent=t.value,t.addEventListener(`input`,()=>n.textContent=t.value),l.append(`: `,n)}c.append(l,t),a.input=t}if(n.help){let t=e.createElement(`span`);t.className=`help`,t.textContent=s(n.help,i),c.append(t)}return a}function re(e,t={}){let n=t.lang||`en`,r=document,o=e=>S[e][n]||S[e].en||e,l=r.createElement(`div`);l.setAttribute(`data-iob-dialog`,``);let u=l.attachShadow({mode:`open`}),f=r.createElement(`style`);f.textContent=ee;let p=r.createElement(`dialog`),m=v(t.theme);p.className=m.type===`dark`?`dark`:``;for(let[e,t]of Object.entries(x(m)))p.style.setProperty(e,t);e.width&&(p.style.width=`${e.width}px`),e.height&&(p.style.height=`${e.height}px`);let h=r.createElement(`form`),g=r.createElement(`header`),_=r.createElement(`span`);_.textContent=s(e.title,n);let y=r.createElement(`button`);y.type=`button`,y.className=`close`,y.title=o(`close`),y.setAttribute(`aria-label`,o(`close`)),y.textContent=`×`,g.append(_,y);let b=r.createElement(`div`);return b.className=`body`,h.append(g,b),p.append(h),u.append(f,p),new Promise(t=>{let f=!1,m=e=>{f||(f=!0,p.open&&p.close(),l.remove(),t(e))};if(y.addEventListener(`click`,()=>m(null)),p.addEventListener(`close`,()=>m(null)),h.addEventListener(`submit`,e=>e.preventDefault()),a(e)){let t={},i=[];for(let[t,a]of Object.entries(e.form.items||{})){let o=e.data?.[t]??a.default,s=ne(r,t,a,o,n);i.push(s),b.append(s.box)}let a=()=>{for(let e of i)e.input&&(t[e.name]=te(e));return t},l=()=>{let e=a();for(let t of i)t.box.hidden=t.hidden?t.hidden(e):!1,t.input&&(t.input.disabled=t.disabled?t.disabled(e):!1)};h.addEventListener(`input`,l),h.addEventListener(`change`,l),l();let u=i.find(e=>e.input&&!e.box.hidden&&!e.input.disabled);u?.input&&(u.input.autofocus=!0);let f=r.createElement(`footer`),p=r.createElement(`button`);p.type=`button`,p.textContent=s(e.cancel,n)||o(`cancel`),p.addEventListener(`click`,()=>m(null));let g=r.createElement(`button`);g.type=`submit`,g.className=`primary`,g.textContent=s(e.ok,n)||o(`ok`),f.append(p,g),h.append(f),h.addEventListener(`submit`,()=>m(d(c(e.form),a())))}else b.append(e.element),p.addEventListener(i,e=>m(e.detail??null));r.body.append(l),p.showModal(),u.activeElement&&u.activeElement!==y||(p.tabIndex=-1,p.focus())})}function T(e){return[...new Set(e.filter(e=>typeof e==`string`&&!!e))]}var ie=[`socket`,`dialogs`,`theme`,`editMode`,`settings`,`value`],ae=class extends HTMLElement{states={};objects={};#e=null;#t={};#n=v(`light`);#r=!1;#i=null;#a=void 0;#o=null;#s=!1;#c=(e,t)=>{this.#o?.states.includes(e)&&(this.states[e]=t||null,this.#_())};#l=(e,t)=>{this.#o?.objects.includes(e)&&(this.objects[e]=t||null,this.#d())};get socket(){return this.#e}set socket(e){this.#e=e||null,this.#d()}get settings(){return this.#t}set settings(e){this.#t=e||{},this.#d()}get theme(){return this.#n}set theme(e){let t=v(e);y(t,this.#n)||(this.#n=t,this.#u(),this.#_())}get editMode(){return this.#r}set editMode(e){let t=!!e;t!==this.#r&&(this.#r=t,this.#_())}get dialogs(){return this.#i}set dialogs(e){this.#i=e||null}get value(){return this.#a}set value(e){e!==this.#a&&(this.#a=e,this.#_())}connectedCallback(){for(let e of ie)if(Object.prototype.hasOwnProperty.call(this,e)){let t=this[e];delete this[e],this[e]=t}this.#u(),this.#d()}disconnectedCallback(){this.#g()}getStateIds(e){return[]}getObjectIds(e){return[]}get systemLang(){return this.#e?.systemLang||`en`}text(e){return s(e,this.systemLang)}setState(e,t){return this.#e&&!this.#r?this.#e.setState(e,t):Promise.resolve()}changeValue(e){return this.#r||this.emit(`iob-change`,e)?!1:(this.value=e,!0)}emit(e,t){return this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0,cancelable:!0}))}async openDialog(e){if(this.#r)return null;let t=this.#i?await this.#i.open(e):await re(e,{lang:this.systemLang,theme:this.#n});return a(e)?t&&typeof t==`object`?d(c(e.form),t):null:t??null}#u(){for(let[e,t]of Object.entries(x(this.#n)))this.style.setProperty(e,t)}#d(){if(!this.isConnected)return;let e=this.#e,t=e?T(this.getStateIds(this.#t)):[],n=e?T(this.getObjectIds(this.#t)):[];this.#o&&this.#o.socket!==e&&this.#g();let r=this.#o?.states||[],i=this.#o?.objects||[],a=r.filter(e=>!t.includes(e)),o=i.filter(e=>!n.includes(e)),s=t.filter(e=>!r.includes(e)),c=n.filter(e=>!i.includes(e));e&&a.length&&e.unsubscribeState(a,this.#c),e&&o.length&&this.#h(e,o);for(let e of a)delete this.states[e];for(let e of[...a,...o])!t.includes(e)&&!n.includes(e)&&delete this.objects[e];this.#o=e&&(t.length||n.length)?{socket:e,states:t,objects:n}:null,e&&s.length&&this.#p(e,s),e&&c.length&&this.#m(e,c),this.#_()}#f(e,t,n){return this.#o?.socket===e&&this.#o[t].includes(n)}#p(e,t){e.subscribeState(t,this.#c).catch(e=>console.warn(`<${this.localName}>: cannot subscribe ${t.join(`, `)}: ${e}`));for(let n of t)e.getState(n).then(t=>{this.#f(e,`states`,n)&&this.states[n]===void 0&&(this.states[n]=t||null,this.#_())}).catch(()=>{}),e.getObject(n).then(t=>{this.#f(e,`states`,n)&&!this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#_())}).catch(()=>{})}#m(e,t){e.subscribeObject(t,this.#l).catch(e=>console.warn(`<${this.localName}>: cannot subscribe the objects ${t.join(`, `)}: ${e}`));for(let n of t)e.getObject(n).then(t=>{this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#d())}).catch(()=>{})}#h(e,t){e.unsubscribeObject(t,this.#l).catch(()=>{})}#g(){if(this.#o){let{socket:e,states:t,objects:n}=this.#o;t.length&&e.unsubscribeState(t,this.#c),n.length&&this.#h(e,n),this.#o=null}this.states={},this.objects={}}#_(){this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.isConnected&&this.render()}))}};function oe(e,t){let n=typeof e==`string`?e:e.tag;customElements.get(n)||customElements.define(n,t)}function se(e){return`iob-nmea-${e}`}var ce=`M11 3 4 15h7V3zm2 1v11h7L13 4zM3 17l1.5 3h15l1.5-3H3z`;function E({text:e,editMode:r}){return/* @__PURE__ */ n(`div`,{className:`hint${r?` edit`:``}`,children:[/* @__PURE__ */ t(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:/* @__PURE__ */ t(`path`,{d:ce})}),/* @__PURE__ */ t(`span`,{children:e})]})}var D={chooseInstance:`Choose an instance of the NMEA adapter in the settings`,chooseState:`Choose a state in the settings`,noValues:`Choose the states to show in the settings`,waiting:`waiting for samples…`,min:`min`,avg:`avg`,max:`max`,noPosition:`No own position`,targets:`targets`,seen:`seen`,distance:`distance`,chain:`chain`,atDrop:`at drop`,depth:`depth`,alarm:`Alarm`,armed:`armed`,off:`off`,radius:`Radius`,dropHere:`Anchor here`,map:`Map`,satellite:`Satellite`,noAnchor:`No anchor position`,zoomIn:`Zoom in`,zoomOut:`Zoom out`,northUp:`North up`,courseUp:`Course up`,mode:`Mode`,lock:`Lock`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`No drift`,confirmTitle:`Confirm large change`,lockedHeading:`Locked heading`,now:`now`,new:`new`,autoCancel:`Cancelled automatically in`,cancel:`Cancel`,confirm:`Confirm`,port:`PORT`,starboard:`STBD`},le={en:D,de:{chooseInstance:`Wählen Sie in den Einstellungen eine Instanz des NMEA-Adapters`,chooseState:`Wählen Sie in den Einstellungen einen Datenpunkt`,noValues:`Wählen Sie in den Einstellungen die anzuzeigenden Datenpunkte`,waiting:`warte auf Werte…`,min:`Min`,avg:`Mittel`,max:`Max`,noPosition:`Keine eigene Position`,targets:`Ziele`,seen:`gesehen`,distance:`Abstand`,chain:`Kette`,atDrop:`beim Ankern`,depth:`Tiefe`,alarm:`Alarm`,armed:`scharf`,off:`aus`,radius:`Radius`,dropHere:`Anker hier`,map:`Karte`,satellite:`Satellit`,noAnchor:`Keine Ankerposition`,zoomIn:`Vergrößern`,zoomOut:`Verkleinern`,northUp:`Norden oben`,courseUp:`Kurs oben`,mode:`Modus`,lock:`Soll`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`Ohne Drift`,confirmTitle:`Große Änderung bestätigen`,lockedHeading:`Gehaltener Kurs`,now:`jetzt`,new:`neu`,autoCancel:`Automatischer Abbruch in`,cancel:`Abbrechen`,confirm:`Bestätigen`,port:`BB`,starboard:`STB`},ru:{chooseInstance:`Выберите в настройках экземпляр адаптера NMEA`,chooseState:`Выберите в настройках состояние`,noValues:`Выберите в настройках отображаемые состояния`,waiting:`ожидание данных…`,min:`мин`,avg:`сред`,max:`макс`,noPosition:`Нет собственной позиции`,targets:`целей`,seen:`замечен`,distance:`расстояние`,chain:`цепь`,atDrop:`при отдаче`,depth:`глубина`,alarm:`Тревога`,armed:`включена`,off:`выкл`,radius:`Радиус`,dropHere:`Якорь здесь`,map:`Карта`,satellite:`Спутник`,noAnchor:`Нет позиции якоря`,zoomIn:`Приблизить`,zoomOut:`Отдалить`,northUp:`Север вверху`,courseUp:`Курс вверху`,mode:`Режим`,lock:`Задан`,modeStandby:`Ожидание`,modeAuto:`Авто`,modeWind:`Ветер`,modeTrack:`Трек`,modeNoDrift:`Без дрейфа`,confirmTitle:`Подтвердите большое изменение`,lockedHeading:`Заданный курс`,now:`сейчас`,new:`новый`,autoCancel:`Автоматическая отмена через`,cancel:`Отмена`,confirm:`Подтвердить`,port:`ЛБ`,starboard:`ПБ`},pt:{chooseInstance:`Escolha uma instância do adaptador NMEA nas definições`,chooseState:`Escolha um estado nas definições`,noValues:`Escolha os estados a mostrar nas definições`,waiting:`aguardando dados…`,min:`mín`,avg:`méd`,max:`máx`,noPosition:`Sem posição própria`,targets:`alvos`,seen:`visto`,distance:`distância`,chain:`corrente`,atDrop:`ao fundear`,depth:`profundidade`,alarm:`Alarme`,armed:`ativo`,off:`desligado`,radius:`Raio`,dropHere:`Âncora aqui`,map:`Mapa`,satellite:`Satélite`,noAnchor:`Sem posição da âncora`,zoomIn:`Aproximar`,zoomOut:`Afastar`,northUp:`Norte para cima`,courseUp:`Rumo para cima`,mode:`Modo`,lock:`Fixo`,modeStandby:`Espera`,modeAuto:`Auto`,modeWind:`Vento`,modeTrack:`Rota`,modeNoDrift:`Sem deriva`,confirmTitle:`Confirmar grande alteração`,lockedHeading:`Rumo fixado`,now:`agora`,new:`novo`,autoCancel:`Cancelamento automático em`,cancel:`Cancelar`,confirm:`Confirmar`,port:`BB`,starboard:`EB`},nl:{chooseInstance:`Kies in de instellingen een instantie van de NMEA-adapter`,chooseState:`Kies in de instellingen een status`,noValues:`Kies in de instellingen de te tonen statussen`,waiting:`wachten op gegevens…`,min:`min`,avg:`gem`,max:`max`,noPosition:`Geen eigen positie`,targets:`doelen`,seen:`gezien`,distance:`afstand`,chain:`ketting`,atDrop:`bij ankeren`,depth:`diepte`,alarm:`Alarm`,armed:`actief`,off:`uit`,radius:`Straal`,dropHere:`Anker hier`,map:`Kaart`,satellite:`Satelliet`,noAnchor:`Geen ankerpositie`,zoomIn:`Inzoomen`,zoomOut:`Uitzoomen`,northUp:`Noord boven`,courseUp:`Koers boven`,mode:`Modus`,lock:`Vast`,modeStandby:`Stand-by`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`Geen drift`,confirmTitle:`Grote wijziging bevestigen`,lockedHeading:`Vastgezette koers`,now:`nu`,new:`nieuw`,autoCancel:`Automatisch geannuleerd over`,cancel:`Annuleren`,confirm:`Bevestigen`,port:`BB`,starboard:`SB`},fr:{chooseInstance:`Choisissez une instance de l'adaptateur NMEA dans les paramètres`,chooseState:`Choisissez un état dans les paramètres`,noValues:`Choisissez les états à afficher dans les paramètres`,waiting:`en attente de données…`,min:`min`,avg:`moy`,max:`max`,noPosition:`Pas de position propre`,targets:`cibles`,seen:`vu`,distance:`distance`,chain:`chaîne`,atDrop:`au mouillage`,depth:`profondeur`,alarm:`Alarme`,armed:`armée`,off:`arrêt`,radius:`Rayon`,dropHere:`Ancre ici`,map:`Carte`,satellite:`Satellite`,noAnchor:`Pas de position d'ancre`,zoomIn:`Zoom avant`,zoomOut:`Zoom arrière`,northUp:`Nord en haut`,courseUp:`Cap en haut`,mode:`Mode`,lock:`Consigne`,modeStandby:`Veille`,modeAuto:`Auto`,modeWind:`Vent`,modeTrack:`Route`,modeNoDrift:`Sans dérive`,confirmTitle:`Confirmer un grand changement`,lockedHeading:`Cap verrouillé`,now:`actuel`,new:`nouveau`,autoCancel:`Annulation automatique dans`,cancel:`Annuler`,confirm:`Confirmer`,port:`BÂB`,starboard:`TRIB`},it:{chooseInstance:`Scegli un'istanza dell'adattatore NMEA nelle impostazioni`,chooseState:`Scegli uno stato nelle impostazioni`,noValues:`Scegli gli stati da mostrare nelle impostazioni`,waiting:`in attesa di dati…`,min:`min`,avg:`media`,max:`max`,noPosition:`Nessuna posizione propria`,targets:`bersagli`,seen:`visto`,distance:`distanza`,chain:`catena`,atDrop:`all'ancoraggio`,depth:`profondità`,alarm:`Allarme`,armed:`attivo`,off:`spento`,radius:`Raggio`,dropHere:`Ancora qui`,map:`Mappa`,satellite:`Satellite`,noAnchor:`Nessuna posizione dell'ancora`,zoomIn:`Ingrandisci`,zoomOut:`Riduci`,northUp:`Nord in alto`,courseUp:`Rotta in alto`,mode:`Modalità`,lock:`Impostata`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Vento`,modeTrack:`Rotta`,modeNoDrift:`Senza deriva`,confirmTitle:`Conferma grande modifica`,lockedHeading:`Rotta bloccata`,now:`ora`,new:`nuovo`,autoCancel:`Annullamento automatico tra`,cancel:`Annulla`,confirm:`Conferma`,port:`SX`,starboard:`DX`},es:{chooseInstance:`Elija una instancia del adaptador NMEA en la configuración`,chooseState:`Elija un estado en la configuración`,noValues:`Elija los estados a mostrar en la configuración`,waiting:`esperando datos…`,min:`mín`,avg:`med`,max:`máx`,noPosition:`Sin posición propia`,targets:`objetivos`,seen:`visto`,distance:`distancia`,chain:`cadena`,atDrop:`al fondear`,depth:`profundidad`,alarm:`Alarma`,armed:`activa`,off:`apagada`,radius:`Radio`,dropHere:`Ancla aquí`,map:`Mapa`,satellite:`Satélite`,noAnchor:`Sin posición del ancla`,zoomIn:`Acercar`,zoomOut:`Alejar`,northUp:`Norte arriba`,courseUp:`Rumbo arriba`,mode:`Modo`,lock:`Fijado`,modeStandby:`En espera`,modeAuto:`Auto`,modeWind:`Viento`,modeTrack:`Ruta`,modeNoDrift:`Sin deriva`,confirmTitle:`Confirmar cambio grande`,lockedHeading:`Rumbo fijado`,now:`ahora`,new:`nuevo`,autoCancel:`Cancelación automática en`,cancel:`Cancelar`,confirm:`Confirmar`,port:`BB`,starboard:`EB`},pl:{chooseInstance:`Wybierz w ustawieniach instancję adaptera NMEA`,chooseState:`Wybierz w ustawieniach stan`,noValues:`Wybierz w ustawieniach stany do wyświetlenia`,waiting:`oczekiwanie na dane…`,min:`min`,avg:`śr`,max:`maks`,noPosition:`Brak własnej pozycji`,targets:`celów`,seen:`widziany`,distance:`odległość`,chain:`łańcuch`,atDrop:`przy kotwiczeniu`,depth:`głębokość`,alarm:`Alarm`,armed:`uzbrojony`,off:`wył.`,radius:`Promień`,dropHere:`Kotwica tutaj`,map:`Mapa`,satellite:`Satelita`,noAnchor:`Brak pozycji kotwicy`,zoomIn:`Powiększ`,zoomOut:`Pomniejsz`,northUp:`Północ u góry`,courseUp:`Kurs u góry`,mode:`Tryb`,lock:`Zadany`,modeStandby:`Czuwanie`,modeAuto:`Auto`,modeWind:`Wiatr`,modeTrack:`Trasa`,modeNoDrift:`Bez dryfu`,confirmTitle:`Potwierdź dużą zmianę`,lockedHeading:`Zablokowany kurs`,now:`teraz`,new:`nowy`,autoCancel:`Automatyczne anulowanie za`,cancel:`Anuluj`,confirm:`Potwierdź`,port:`LB`,starboard:`PB`},uk:{chooseInstance:`Виберіть у налаштуваннях екземпляр адаптера NMEA`,chooseState:`Виберіть у налаштуваннях стан`,noValues:`Виберіть у налаштуваннях стани для відображення`,waiting:`очікування даних…`,min:`мін`,avg:`сер`,max:`макс`,noPosition:`Немає власної позиції`,targets:`цілей`,seen:`помічено`,distance:`відстань`,chain:`ланцюг`,atDrop:`при віддачі`,depth:`глибина`,alarm:`Тривога`,armed:`увімкнено`,off:`вимк`,radius:`Радіус`,dropHere:`Якір тут`,map:`Карта`,satellite:`Супутник`,noAnchor:`Немає позиції якоря`,zoomIn:`Наблизити`,zoomOut:`Віддалити`,northUp:`Північ угорі`,courseUp:`Курс угорі`,mode:`Режим`,lock:`Задано`,modeStandby:`Очікування`,modeAuto:`Авто`,modeWind:`Вітер`,modeTrack:`Трек`,modeNoDrift:`Без дрейфу`,confirmTitle:`Підтвердьте велику зміну`,lockedHeading:`Заданий курс`,now:`зараз`,new:`новий`,autoCancel:`Автоматичне скасування через`,cancel:`Скасувати`,confirm:`Підтвердити`,port:`ЛБ`,starboard:`ПБ`},"zh-cn":{chooseInstance:`请在设置中选择一个 NMEA 适配器实例`,chooseState:`请在设置中选择一个状态`,noValues:`请在设置中选择要显示的状态`,waiting:`等待数据…`,min:`最小`,avg:`平均`,max:`最大`,noPosition:`没有本船位置`,targets:`个目标`,seen:`最后出现`,distance:`距离`,chain:`锚链`,atDrop:`抛锚时`,depth:`水深`,alarm:`警报`,armed:`已启用`,off:`关闭`,radius:`半径`,dropHere:`在此抛锚`,map:`地图`,satellite:`卫星`,noAnchor:`没有锚位`,zoomIn:`放大`,zoomOut:`缩小`,northUp:`北向上`,courseUp:`航向向上`,mode:`模式`,lock:`锁定`,modeStandby:`待机`,modeAuto:`自动`,modeWind:`风向`,modeTrack:`航迹`,modeNoDrift:`无漂移`,confirmTitle:`确认大幅更改`,lockedHeading:`锁定航向`,now:`当前`,new:`新`,autoCancel:`自动取消倒计时`,cancel:`取消`,confirm:`确认`,port:`左舷`,starboard:`右舷`}};function ue(e,t){return(le[e]||D)[t]||D[t]}var O={en:{port:`P`,starboard:`S`},de:{port:`B`,starboard:`S`},ru:{port:`Л`,starboard:`П`},uk:{port:`Л`,starboard:`П`},pl:{port:`L`,starboard:`P`},nl:{port:`B`,starboard:`S`},fr:{port:`B`,starboard:`T`},it:{port:`B`,starboard:`T`},pt:{port:`B`,starboard:`E`},es:{port:`B`,starboard:`E`},"zh-cn":{port:`左`,starboard:`右`}};function k(e){return O[e]||O.en}var A={wind:{en:`NMEA Wind`,de:`NMEA-Wind`,ru:`NMEA Ветер`,pt:`Vento NMEA`,nl:`NMEA-wind`,fr:`Vent NMEA`,it:`Vento NMEA`,es:`Viento NMEA`,pl:`Wiatr NMEA`,uk:`NMEA Вітер`,"zh-cn":`NMEA 风`},"history-chart":{en:`NMEA Chart`,de:`NMEA-Diagramm`,ru:`NMEA График`,pt:`Gráfico NMEA`,nl:`NMEA-grafiek`,fr:`Graphique NMEA`,it:`Grafico NMEA`,es:`Gráfico NMEA`,pl:`Wykres NMEA`,uk:`NMEA Графік`,"zh-cn":`NMEA 图表`},autopilot:{en:`NMEA Autopilot`,de:`NMEA-Autopilot`,ru:`NMEA Автопилот`,pt:`Piloto automático NMEA`,nl:`NMEA-stuurautomaat`,fr:`Pilote automatique NMEA`,it:`Autopilota NMEA`,es:`Piloto automático NMEA`,pl:`Autopilot NMEA`,uk:`NMEA Автопілот`,"zh-cn":`NMEA 自动驾驶仪`},"ais-radar":{en:`NMEA AIS Radar`,de:`NMEA-AIS-Radar`,ru:`NMEA AIS-радар`,pt:`Radar AIS NMEA`,nl:`NMEA AIS-radar`,fr:`Radar AIS NMEA`,it:`Radar AIS NMEA`,es:`Radar AIS NMEA`,pl:`Radar AIS NMEA`,uk:`NMEA AIS-радар`,"zh-cn":`NMEA AIS 雷达`},"anchor-position":{en:`NMEA Anchor Position`,de:`NMEA-Ankerposition`,ru:`NMEA Позиция якоря`,pt:`Posição da âncora NMEA`,nl:`NMEA-ankerpositie`,fr:`Position d'ancre NMEA`,it:`Posizione dell'ancora NMEA`,es:`Posición del ancla NMEA`,pl:`Pozycja kotwicy NMEA`,uk:`NMEA Позиція якоря`,"zh-cn":`NMEA 锚位`},instrument:{en:`Instrument`,de:`Instrument`,ru:`Инструмент`,pt:`Instrumento`,nl:`Instrument`,fr:`Instrument`,it:`Strumento`,es:`Instrumento`,pl:`Instrument`,uk:`Інструмент`,"zh-cn":`乐器`},compass:{en:`NMEA Compass`,de:`NMEA-Kompass`,ru:`NMEA Компас`,pt:`Bússola NMEA`,nl:`NMEA-kompas`,fr:`Compas NMEA`,it:`Bussola NMEA`,es:`Compás NMEA`,pl:`Kompas NMEA`,uk:`NMEA Компас`,"zh-cn":`NMEA 罗经`},rudder:{en:`NMEA Rudder`,de:`NMEA-Ruder`,ru:`NMEA Руль`,pt:`Leme NMEA`,nl:`NMEA-roer`,fr:`Gouvernail NMEA`,it:`Timone NMEA`,es:`Timón NMEA`,pl:`Ster NMEA`,uk:`NMEA Кермо`,"zh-cn":`NMEA 舵`}},de=Math.PI/180;function j(e){return(e%360+360)%360}function fe(e){let t=j(e);return t>180?t-360:t}function M(e,t){let n=j(e-t);return n>180?360-n:n}function N(e,t,n,r){let i=r*de;return{x:e+n*Math.sin(i),y:t-n*Math.cos(i)}}var pe=class{#e=/* @__PURE__ */ new Map;get(e,t){let n=this.#e.get(e);if(t==null||!Number.isFinite(t))return n??0;if(n===void 0)return this.#e.set(e,t),t;let r=n+fe(t-n);return this.#e.set(e,r),r}};function P(e,t,n){if(e==null||!Number.isFinite(e))return`—`;let r=e.toFixed(t);return n?r.replace(`.`,`,`):r}function F(e){return e==null||!Number.isFinite(e)?`---`:(Math.round(j(e))%360).toString().padStart(3,`0`)}var I=`
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mount {
    position: relative;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    /* the size of the box does not depend on what is in it */
    container-type: size;
    overflow: hidden;
    color: inherit;
    font: inherit;
    --nmea-orange: #ff9100;
    --nmea-yellow: #ffdf00;
    --nmea-pink: #fc0fc0;
    --nmea-blue: #3298ff;
    --nmea-dim: #9aa8b8;
}
.mount.light {
    --nmea-orange: #e65100;
    --nmea-yellow: #a07800;
    --nmea-pink: #c2008f;
    --nmea-blue: #1565c0;
    --nmea-dim: #5c6e80;
}
.mount.dialog {
    min-height: 60vh;
}
.mount.dialog.fit {
    height: auto;
    min-height: 0;
    container-type: inline-size;
}
.edit {
    pointer-events: none;
}
.fill {
    position: absolute;
    inset: 0;
}
svg {
    display: block;
}
svg text {
    font-family: inherit;
}
.clickable {
    cursor: pointer;
}
.clickable:focus-visible {
    outline: 2px solid var(--iob-primary);
    outline-offset: -2px;
}
.hint {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 7cqmin, 16px);
}
.hint svg {
    width: clamp(20px, 20cqmin, 48px);
    height: clamp(20px, 20cqmin, 48px);
    fill: currentColor;
    opacity: 0.6;
}
button.btn {
    font: inherit;
    font-size: 14px;
    min-width: 44px;
    min-height: 36px;
    padding: 4px 12px;
    border-radius: var(--iob-border-radius, 4px);
    border: 1px solid var(--iob-divider);
    background: transparent;
    color: inherit;
    cursor: pointer;
}
button.btn:hover:not(:disabled) {
    background: color-mix(in srgb, currentColor 10%, transparent);
}
button.btn:disabled {
    opacity: 0.4;
    cursor: default;
}
button.btn.primary {
    background: var(--iob-primary);
    border-color: var(--iob-primary);
    color: var(--iob-primary-contrast, #fff);
}
`,L=`system.config`,R=class extends ae{#e;#t;#n=/* @__PURE__ */ new Set;#r=null;#i=null;#a=0;tickMs=0;throttleMs=0;constructor(e){super();let t=this.attachShadow({mode:`open`}),n=document.createElement(`style`);n.textContent=I+e,this.#t=document.createElement(`div`),this.#t.className=`mount`,t.append(n,this.#t),this.#e=r(this.#t)}connectedCallback(){super.connectedCallback(),this.tickMs&&!this.#r&&(this.#r=setInterval(()=>{!document.hidden&&this.isConnected&&this.render()},this.tickMs))}disconnectedCallback(){super.disconnectedCallback(),this.#r&&=(clearInterval(this.#r),null),this.#i&&=(clearTimeout(this.#i),null)}getObjectIds(e){return[L]}get isFloatComma(){return!!this.objects[L]?.common?.isFloatComma}get defaultHistory(){return this.objects[`system.config`]?.common?.defaultHistory||``}word(e){return ue(this.systemLang,e)}num(e){if(!e)return null;let t=this.states[e]?.val;if(t==null||t===``)return null;let n=typeof t==`string`?parseFloat(t.replace(`,`,`.`)):Number(t);return Number.isFinite(n)?n:null}render(){if(this.throttleMs){let e=this.#a+this.throttleMs-Date.now();if(e>0){this.#i||=setTimeout(()=>{this.#i=null,this.isConnected&&this.render()},e);return}}this.#a=Date.now(),this.#t.classList.toggle(`light`,this.theme.type===`light`),this.#e.render(this.renderContent());for(let e of this.#n)e()}async showElementDialog(e){if(this.editMode)return null;let t=document.createElement(`div`);t.style.width=`100%`,t.style.height=`100%`;let n=t.attachShadow({mode:`open`}),a=document.createElement(`style`);a.textContent=I+e.css;let o=document.createElement(`div`);o.className=e.fit?`mount dialog fit`:`mount dialog`,n.append(a,o);let s=r(o),c=(e=null)=>{t.dispatchEvent(new CustomEvent(i,{detail:e,bubbles:!0,composed:!0}))},l=()=>{for(let[e,n]of Object.entries(x(this.theme)))t.style.setProperty(e,n);o.classList.toggle(`light`,this.theme.type===`light`),s.render(e.draw(c))};this.#n.add(l),l();try{return await this.openDialog({title:e.title,element:t,width:e.width,height:e.height})}finally{this.#n.delete(l),s.unmount()}}},z=1e3,me=500,B=80,V=500,H=500,U=480,W=465,G=370,K=U*2,q=20,J=530,he=32,Y=35,ge=20,X=1e4,Z=[{val:0,word:`modeStandby`,color:`#d32f2f`},{val:1,word:`modeAuto`,color:`#2e7d32`},{val:2,word:`modeWind`,color:`#29b6f6`},{val:3,word:`modeTrack`,color:`#ed6c02`},{val:4,word:`modeNoDrift`,color:`#9c27b0`}],Q={port:`#c62828`,starboard:`#2e7d32`,grey:`#888888`,yellow:`#FFD700`,yellowDark:`#B38600`,drag:`#ff7a00`,north:`#3a8dff`,south:`#ff3b3b`},$=`
.ap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(2px, 2cqmin, 8px);
    box-sizing: border-box;
    gap: 6px;
}
.dial {
    position: relative;
    flex: 1;
    width: 100%;
    min-height: 0;
}
.dial svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
}
.dial svg.drag {
    cursor: pointer;
}
.fg { fill: currentColor; }
.fg-stroke { stroke: currentColor; }
.dim { fill: var(--nmea-dim); }
.ring { fill: var(--nmea-ring); stroke: currentColor; }
.mount { --nmea-ring: #1b2733; }
.mount.light { --nmea-ring: #e8eef3; }
.rot {
    transform-origin: 500px 500px;
    transition: transform 400ms linear;
}
.controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 100%;
}
.group {
    display: flex;
    width: 100%;
    max-width: 440px;
}
.group button.btn {
    flex: 1;
    min-width: 0;
    padding: 4px 2px;
    border-radius: 0;
    margin-left: -1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.group button.btn:first-child {
    border-radius: var(--iob-border-radius, 4px) 0 0 var(--iob-border-radius, 4px);
    margin-left: 0;
}
.group button.btn:last-child {
    border-radius: 0 var(--iob-border-radius, 4px) var(--iob-border-radius, 4px) 0;
}
.speeds {
    display: flex;
    justify-content: space-around;
    width: 100%;
    text-align: center;
}
.speeds .label { font-size: 12px; font-weight: 700; }
.speeds .value { font-size: 28px; font-weight: 800; line-height: 1; }
.speeds .unit { font-size: 11px; opacity: 0.8; }
.stw { color: var(--nmea-blue); }
.sog { color: var(--nmea-pink); }
.open {
    display: none;
    position: absolute;
    inset: 0;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
}
.bar {
    display: none;
    position: absolute;
    inset: 0;
    align-items: center;
    justify-content: space-around;
    text-align: center;
}
.bar .label { font-size: clamp(10px, 16cqh, 14px); font-weight: 600; color: var(--iob-text-secondary); }
.bar .value { font-size: clamp(14px, 40cqh, 44px); font-weight: 800; line-height: 1.05; }
/* in the box of the host only: the dialog always shows the buttons */
@container (max-height: 379px) {
    .mount:not(.dialog) .controls { display: none; }
    .mount:not(.dialog) .open { display: block; }
}
@container (max-width: 299px) {
    .mount:not(.dialog) .controls { display: none; }
    .mount:not(.dialog) .open { display: block; }
}
@container (min-aspect-ratio: 5/2) {
    .mount:not(.dialog) .ap { display: none; }
    .mount:not(.dialog) .bar { display: flex; }
}
.confirm {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    min-width: 260px;
}
.confirm .title { font-size: 18px; font-weight: 700; }
.confirm .row {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 16px;
}
.confirm .small { font-size: 12px; opacity: 0.7; text-align: center; }
.confirm .big { font-size: 36px; font-weight: 700; text-align: center; }
.confirm .countdown {
    height: 4px;
    border-radius: 2px;
    background: var(--iob-divider);
    overflow: hidden;
}
.confirm .countdown div {
    height: 100%;
    background: currentColor;
    animation: nmea-countdown ${X}ms linear forwards;
}
@keyframes nmea-countdown {
    from { width: 100%; }
    to { width: 0; }
}
.confirm .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
`;function _e(e,t){if(e===null)return{digits:`---`,side:``};let n=Math.round(j(e))%360;if(n===0||n===180)return{digits:String(n),side:``};let r=k(t);return n<180?{digits:String(n),side:r.starboard}:{digits:String(360-n),side:r.port}}var ve=0,ye=class r extends R{#e=new pe;#t=`nmea-ap-${++ve}`;#n=null;#r=null;#i=null;constructor(){super($)}disconnectedCallback(){super.disconnectedCallback(),this.#n=null,this.#r?.(null)}getStateIds(e){let t=e.instance;return t?[`${t}.autoPilot.state`,`${t}.autoPilot.heading`,`${t}.autoPilot.windAngle`,`${t}.vesselHeading.headingTrue`,`${t}.windData.windAngleApparent`,`${t}.rudder.position`,`${t}.speed.speedWaterReferenced`,`${t}.cogSogRapidUpdate.sog`]:[]}#a(){let e=this.settings.instance||``;return{mode:this.num(`${e}.autoPilot.state`),heading:this.num(`${e}.vesselHeading.headingTrue`),locked:this.num(`${e}.autoPilot.heading`),awa:this.num(`${e}.windData.windAngleApparent`),rudder:this.num(`${e}.rudder.position`),stw:this.num(`${e}.speed.speedWaterReferenced`),sog:this.num(`${e}.cogSogRapidUpdate.sog`),windAngle:this.num(`${e}.autoPilot.windAngle`)}}#o(e,t){let n=this.settings.instance;n&&this.setState(`${n}.${e}`,t)}#s(e,t){e===2?this.#o(`autoPilot.windAngleChange`,t):this.#o(`autoPilot.heading${t>0?`Plus`:`Minus`}${Math.abs(t)}`,!0)}static#c(e){let t=e.currentTarget,n=t.getScreenCTM?.();if(!n)return null;let r=t.createSVGPoint();r.x=e.clientX,r.y=e.clientY;let i=r.matrixTransform(n.inverse()),a=i.x-V,o=H-i.y;return!a&&!o?null:j(Math.atan2(a,o)*180/Math.PI)}#l=e=>{if(this.editMode||this.#a().mode!==1)return;let t=r.#c(e);if(t!==null){try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}e.preventDefault(),this.#n=t,this.render()}};#u=e=>{if(this.#n===null)return;let t=r.#c(e);t!==null&&(this.#n=t,this.render())};#d=e=>{if(this.#n===null)return;let t=this.#f();if(this.#n=null,this.render(),e.type===`pointercancel`||t===null)return;let n=this.#a(),r=Math.round(t)%360;n.mode===1&&(n.locked===null||M(r,n.locked)<=ge?this.#o(`autoPilot.heading`,r):this.#p(r,n.locked))};#f(){return this.#n===null?null:j((this.#a().heading??0)+this.#n)}async#p(e,r){if(this.#r)return;let i=Z[1].color,a=Math.round(M(e,r));this.#i=setTimeout(()=>this.#r?.(null),X);let o=null;try{o=await this.showElementDialog({title:this.word(`confirmTitle`),css:$,width:400,fit:!0,draw:o=>(this.#r=o,/* @__PURE__ */ n(`div`,{className:`confirm`,children:[/* @__PURE__ */ n(`div`,{children:[this.word(`lockedHeading`),`:`]}),/* @__PURE__ */ n(`div`,{className:`row`,children:[/* @__PURE__ */ n(`div`,{children:[/* @__PURE__ */ t(`div`,{className:`small`,children:this.word(`now`)}),/* @__PURE__ */ n(`div`,{className:`big`,children:[F(r),`°`]})]}),/* @__PURE__ */ t(`div`,{className:`big`,children:`→`}),/* @__PURE__ */ n(`div`,{style:{color:i},children:[/* @__PURE__ */ t(`div`,{className:`small`,children:this.word(`new`)}),/* @__PURE__ */ n(`div`,{className:`big`,children:[F(e),`°`]})]})]}),/* @__PURE__ */ t(`div`,{className:`small`,children:`Δ ${a}°`}),/* @__PURE__ */ t(`div`,{className:`small`,children:`${this.word(`autoCancel`)} ${X/1e3} s`}),/* @__PURE__ */ t(`div`,{className:`countdown`,children:/* @__PURE__ */ t(`div`,{})}),/* @__PURE__ */ n(`div`,{className:`actions`,children:[/* @__PURE__ */ t(`button`,{type:`button`,className:`btn`,onClick:()=>o(null),children:this.word(`cancel`)}),/* @__PURE__ */ t(`button`,{type:`button`,className:`btn primary`,style:{background:i,borderColor:i,color:`#fff`},onClick:()=>o(`confirm`),children:this.word(`confirm`)})]})]}))})}finally{this.#i&&=(clearTimeout(this.#i),null),this.#r=null}o===`confirm`&&this.#a().mode===1&&this.#o(`autoPilot.heading`,e)}#m=()=>{this.editMode||this.showElementDialog({title:this.text(A.autopilot),css:$,width:520,height:640,draw:()=>this.#g(!1)})};#h(r,i){let{mode:a,heading:o,locked:s,awa:c,rudder:l,windAngle:u}=r,d=this.settings.showRudder!==!1,f=this.settings.showAwa!==!1,p=me+(d?B:0),m=`${this.#t}-clip`,h=Z.find(e=>e.val===a),g=this.#f(),_=[];for(let e=0;e<360;e+=10){let n=e%30==0,r=n?22:12,i=N(V,H,W-r/2,e),a=N(V,H,W+r/2,e);if(_.push(/* @__PURE__ */ t(`line`,{className:`fg-stroke`,x1:i.x,y1:i.y,x2:a.x,y2:a.y,strokeWidth:n?6:3},`t${e}`)),n){let n=N(V,H,415,e),r=e%90==0,i=e===0?`N`:e===90?`E`:e===180?`S`:e===270?`W`:String(e);_.push(/* @__PURE__ */ t(`text`,{className:e===0||e===180?void 0:`fg`,x:n.x,y:n.y,fill:e===0?Q.north:e===180?Q.south:void 0,fontSize:r?38:32,fontWeight:r?700:400,textAnchor:`middle`,dominantBaseline:`central`,transform:`rotate(${e} ${n.x} ${n.y})`,children:i},`l${e}`))}}let v=(e,t)=>{let n=N(V,H,465,e),r=N(V,H,465,t);return`M ${n.x} ${n.y} A 465 465 0 0 1 ${r.x} ${r.y}`},y=null;if(d){let e=K/2,r=null;if(l!==null){let n=Math.max(-35,Math.min(Y,l))/Y*e;r=/* @__PURE__ */ t(`rect`,{x:n>=0?500:500+n,y:532,width:Math.abs(n),height:28,fill:n>=0?Q.starboard:Q.port,style:{transition:`all 0.3s linear`}})}y=/* @__PURE__ */ n(`g`,{children:[/* @__PURE__ */ t(`rect`,{className:`fg-stroke`,x:q,y:J,width:K,height:he,fill:`none`,strokeWidth:2}),[.25,.5,.75].map(e=>/* @__PURE__ */ t(`line`,{className:`fg-stroke`,x1:q+K*e,y1:J,x2:q+K*e,y2:562,strokeWidth:2},e)),r]})}let b;if(g!==null)b=/* @__PURE__ */ n(e,{children:[/* @__PURE__ */ n(`text`,{x:V,y:400,fill:Q.drag,fontSize:140,fontWeight:700,textAnchor:`middle`,children:[F(g),`°`]}),/* @__PURE__ */ t(`text`,{className:`dim`,x:V,y:470,fontSize:48,textAnchor:`middle`,children:`${this.word(`now`)} ${F(s)}°`})]});else if(a===2){let{digits:r,side:i}=_e(u,this.systemLang);b=/* @__PURE__ */ n(e,{children:[/* @__PURE__ */ n(`g`,{transform:`translate(260, 330)`,children:[/* @__PURE__ */ t(`line`,{className:`fg-stroke`,x1:8,y1:0,x2:8,y2:110,strokeWidth:5,strokeLinecap:`round`}),/* @__PURE__ */ t(`path`,{d:`M 8 5 Q 55 55 8 95 Z`,fill:Q.yellow,stroke:Q.yellowDark,strokeWidth:2}),/* @__PURE__ */ t(`path`,{className:`fg`,d:`M -10 102 L 48 102 Q 38 118 -5 112 Z`})]}),/* @__PURE__ */ t(`text`,{className:`fg`,x:V,y:440,fontSize:150,fontWeight:700,textAnchor:`middle`,children:`${r}°${i}`})]})}else b=/* @__PURE__ */ t(`text`,{className:`fg`,x:V,y:440,fontSize:150,fontWeight:700,textAnchor:`middle`,children:`${F(a!==null&&a!==0?s:o)}°`});return/* @__PURE__ */ n(`svg`,{className:i&&a===1?`drag`:void 0,viewBox:`0 0 ${z} ${p}`,preserveAspectRatio:`xMidYMid meet`,onPointerDown:i?this.#l:void 0,onPointerMove:i?this.#u:void 0,onPointerUp:i?this.#d:void 0,onPointerCancel:i?this.#d:void 0,children:[/* @__PURE__ */ t(`defs`,{children:/* @__PURE__ */ t(`clipPath`,{id:m,children:/* @__PURE__ */ t(`rect`,{x:0,y:0,width:z,height:H})})}),/* @__PURE__ */ t(`rect`,{x:0,y:0,width:z,height:p,fill:`transparent`}),/* @__PURE__ */ t(`path`,{className:`ring`,d:`M 20 ${H} A ${U} ${U} 0 0 1 980 ${H} L 870 ${H} A ${G} ${G} 0 0 0 130 ${H} Z`,strokeWidth:3}),/* @__PURE__ */ t(`path`,{d:v(-90,90),fill:`none`,stroke:Q.grey,strokeWidth:30}),/* @__PURE__ */ t(`path`,{d:v(-66,-30),fill:`none`,stroke:Q.port,strokeWidth:30}),/* @__PURE__ */ t(`path`,{d:v(30,66),fill:`none`,stroke:Q.starboard,strokeWidth:30}),/* @__PURE__ */ t(`g`,{clipPath:`url(#${m})`,children:/* @__PURE__ */ t(`g`,{className:`rot`,style:{transform:`rotate(${this.#e.get(`heading`,o===null?null:-o)}deg)`},children:_})}),a===2&&c!==null?/* @__PURE__ */ t(`g`,{clipPath:`url(#${m})`,children:/* @__PURE__ */ t(`g`,{className:`rot`,style:{transform:`rotate(${this.#e.get(`awa`,c)}deg)`},children:/* @__PURE__ */ t(`path`,{d:`M ${V} 25 L 482 70 L 518 70 Z`,fill:Q.yellow,stroke:Q.yellowDark,strokeWidth:3})})}):null,this.#n===null?null:/* @__PURE__ */ t(`g`,{clipPath:`url(#${m})`,children:/* @__PURE__ */ n(`g`,{transform:`rotate(${this.#n} ${V} ${H})`,children:[/* @__PURE__ */ t(`line`,{x1:V,y1:160,x2:V,y2:70,stroke:Q.drag,strokeWidth:6,strokeLinecap:`round`,opacity:.8}),/* @__PURE__ */ t(`path`,{d:`M ${V} 25 L 478 76 L 522 76 Z`,fill:Q.drag,stroke:`#a04a00`,strokeWidth:3})]})}),/* @__PURE__ */ t(`path`,{className:`fg`,d:`M ${V} 91 L 474 131 L 526 131 Z`,opacity:.5}),/* @__PURE__ */ t(`text`,{className:`dim`,x:90,y:50,fontSize:28,fontWeight:700,textAnchor:`middle`,children:`HDG`}),/* @__PURE__ */ t(`text`,{className:`fg`,x:90,y:108,fontSize:56,fontWeight:700,textAnchor:`middle`,children:`${F(o)}°`}),f?/* @__PURE__ */ n(e,{children:[/* @__PURE__ */ t(`text`,{className:a===2?void 0:`dim`,fill:a===2?Q.yellowDark:void 0,x:910,y:50,fontSize:28,fontWeight:700,textAnchor:`middle`,children:`AWA`}),/* @__PURE__ */ t(`text`,{className:a===2?void 0:`dim`,fill:a===2?Q.yellow:void 0,x:910,y:108,fontSize:56,fontWeight:700,textAnchor:`middle`,children:`${c===null?`--`:Math.abs(Math.round(c))}°`})]}):null,/* @__PURE__ */ t(`text`,{className:h?void 0:`dim`,fill:h?.color,x:V,y:300,fontSize:42,fontWeight:700,textAnchor:`middle`,children:h?this.word(h.word).toUpperCase():`---`}),b,y]})}#g(e){let r=this.#a(),{mode:i}=r,a=i===null||i===0||i===3,o=this.isFloatComma;return/* @__PURE__ */ n(`div`,{className:`ap`,children:[/* @__PURE__ */ n(`div`,{className:`dial`,children:[this.#h(r,!0),e?/* @__PURE__ */ t(`button`,{type:`button`,className:`open`,title:this.text(A.autopilot),"aria-label":this.text(A.autopilot),onClick:this.#m}):null]}),/* @__PURE__ */ n(`div`,{className:`controls`,children:[/* @__PURE__ */ t(`div`,{className:`group`,children:Z.slice(0,4).map(e=>{let n=i===e.val;return/* @__PURE__ */ t(`button`,{type:`button`,className:`btn`,style:{color:n?`#fff`:e.color,background:n?e.color:`transparent`,borderColor:e.color,fontWeight:n?700:500},onClick:()=>this.#o(`autoPilot.state`,e.val),children:this.word(e.word)},e.val)})}),/* @__PURE__ */ t(`div`,{className:`group`,children:[-10,-1,1,10].map(e=>/* @__PURE__ */ t(`button`,{type:`button`,className:`btn`,disabled:a,onClick:()=>this.#s(i,e),children:e>0?`+${e}`:`−${-e}`},e))}),/* @__PURE__ */ n(`div`,{className:`speeds`,children:[/* @__PURE__ */ n(`div`,{className:`stw`,children:[/* @__PURE__ */ t(`div`,{className:`label`,children:`STW`}),/* @__PURE__ */ t(`div`,{className:`value`,children:P(r.stw,1,o)}),/* @__PURE__ */ t(`div`,{className:`unit`,children:`kn`})]}),/* @__PURE__ */ n(`div`,{className:`sog`,children:[/* @__PURE__ */ t(`div`,{className:`label`,children:`SOG`}),/* @__PURE__ */ t(`div`,{className:`value`,children:P(r.sog,1,o)}),/* @__PURE__ */ t(`div`,{className:`unit`,children:`kn`})]})]})]})]})}renderContent(){if(!this.settings.instance)return/* @__PURE__ */ t(E,{text:this.word(`chooseInstance`),editMode:this.editMode});let e=this.#a(),r=Z.find(t=>t.val===e.mode);return/* @__PURE__ */ n(`div`,{className:`fill${this.editMode?` edit`:``}`,children:[this.#g(!0),/* @__PURE__ */ n(`div`,{className:`bar clickable`,role:`button`,tabIndex:this.editMode?void 0:0,onClick:this.#m,onKeyDown:e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),this.#m())},children:[/* @__PURE__ */ n(`div`,{children:[/* @__PURE__ */ t(`div`,{className:`label`,children:`HDG`}),/* @__PURE__ */ n(`div`,{className:`value`,children:[F(e.heading),`°`]})]}),/* @__PURE__ */ n(`div`,{children:[/* @__PURE__ */ t(`div`,{className:`label`,children:this.word(`mode`)}),/* @__PURE__ */ t(`div`,{className:`value`,style:{color:r?.color},children:r?this.word(r.word).toUpperCase():`—`})]}),/* @__PURE__ */ n(`div`,{children:[/* @__PURE__ */ t(`div`,{className:`label`,children:this.word(`lock`)}),/* @__PURE__ */ t(`div`,{className:`value`,children:e.mode!==null&&e.mode!==0?`${F(e.locked)}°`:`—`})]})]})]})}};oe(se(`autopilot`),ye);