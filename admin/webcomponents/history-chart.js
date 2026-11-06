import{jsx as e,jsxs as t,createRoot as n}from"../../../lib/esm/react-19.js";var r=`iob-dialog-close`;function i(e){return!!e.form}var a=[`header`,`staticText`,`divider`];function o(e,t){return e==null?``:typeof e==`object`?e[t]||e.en||Object.values(e).find(e=>!!e)||``:String(e)}function s(e){let t={};for(let[n,r]of Object.entries(e.items||{}))r&&!a.includes(r.type)&&(t[n]=r.type);return t}function c(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?e.toString():JSON.stringify(e)}function l(e,t){if(t!=null)switch(e){case`number`:case`slider`:{if(typeof t==`number`)return Number.isFinite(t)?t:void 0;let e=c(t).trim().replace(`,`,`.`);if(!e)return;let n=Number(e);return Number.isFinite(n)?n:void 0}case`checkbox`:return t===!0||t===`true`||t===1||t===`1`;default:return c(t)}}function u(e,t){let n={};for(let[r,i]of Object.entries(e)){let e=l(i,t[r]);e!==void 0&&(n[r]=e)}return n}var d=`"Roboto", "Helvetica", "Arial", sans-serif`,f=Object.freeze({type:`light`,primary:`#3399CC`,primaryContrast:`#FFFFFF`,secondary:`#164477`,secondaryContrast:`#FFFFFF`,background:`#FFFFFF`,paper:`#FFFFFF`,text:`rgba(0, 0, 0, 0.87)`,textSecondary:`rgba(0, 0, 0, 0.6)`,divider:`rgba(0, 0, 0, 0.12)`,error:`#D32F2F`,warning:`#ED6C02`,info:`#0288D1`,success:`#2E7D32`,fontFamily:d,fontSize:14,borderRadius:4}),p=Object.freeze({type:`dark`,primary:`#4DABF5`,primaryContrast:`rgba(0, 0, 0, 0.87)`,secondary:`#436A93`,secondaryContrast:`#FFFFFF`,background:`#121212`,paper:`#121212`,text:`#FFFFFF`,textSecondary:`rgba(255, 255, 255, 0.7)`,divider:`rgba(255, 255, 255, 0.12)`,error:`#F44336`,warning:`#FFA726`,info:`#29B6F6`,success:`#66BB6A`,fontFamily:d,fontSize:14,borderRadius:4}),m=[`primary`,`primaryContrast`,`secondary`,`secondaryContrast`,`background`,`paper`,`text`,`textSecondary`,`divider`,`error`,`warning`,`info`,`success`,`fontFamily`],h=[`fontSize`,`borderRadius`];function g(e){return{...e===`dark`?p:f}}function _(e){if(!e||typeof e!=`object`)return g(typeof e==`string`?e:`light`);let t=e,n=g(typeof t.type==`string`?t.type:`light`);for(let e of m){let r=t[e];typeof r==`string`&&r.trim()&&(n[e]=r.trim())}for(let e of h){let r=t[e],i=typeof r==`string`?parseFloat(r):r;typeof i==`number`&&Number.isFinite(i)&&i>=0&&(n[e]=i)}return n}function v(e,t){return e.type===t.type&&m.every(n=>e[n]===t[n])&&h.every(n=>e[n]===t[n])}function y(e){return`--iob-${e.replace(/[A-Z]/g,e=>`-${e.toLowerCase()}`)}`}function b(e){let t={};for(let n of m)t[y(n)]=e[n];for(let n of h)t[y(n)]=`${e[n]}px`;return t[`color-scheme`]=e.type,t}var x={ok:{en:`OK`,"zh-cn":`确定`},cancel:{en:`Cancel`,de:`Abbrechen`,ru:`Отмена`,pt:`Cancelar`,nl:`Annuleren`,fr:`Annuler`,it:`Annulla`,es:`Cancelar`,pl:`Anuluj`,uk:`Скасувати`,"zh-cn":`取消`},close:{en:`Close`,de:`Schließen`,ru:`Закрыть`,pt:`Fechar`,nl:`Sluiten`,fr:`Fermer`,it:`Chiudi`,es:`Cerrar`,pl:`Zamknij`,uk:`Закрити`,"zh-cn":`关闭`}},S=`
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
`;function C(e){if(!e)return null;try{let t=Function(`data`,`return (${e});`);return e=>{try{return!!t(e)}catch{return!1}}}catch{return null}}function w(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?String(e):``}function T(e){let{input:t,setting:n}=e;if(t)return t instanceof HTMLInputElement&&t.type===`checkbox`?t.checked:t instanceof HTMLSelectElement?n.options?.[t.selectedIndex]?.value:t.value}function E(e,t,n,r,i){let a={name:t,setting:n,box:e.createElement(`div`),hidden:C(n.hidden),disabled:C(n.disabled)},s=o(n.label,i);switch(n.type){case`header`:return a.box=e.createElement(`h3`),a.box.textContent=o(n.text,i)||s,a;case`staticText`:return a.box=e.createElement(`p`),a.box.textContent=o(n.text,i)||s,a;case`divider`:return a.box=e.createElement(`hr`),a}let c=e.createElement(`label`);a.box=c;let l=e.createElement(`span`);if(l.textContent=s||t,n.type===`checkbox`){let t=e.createElement(`input`);t.type=`checkbox`,t.checked=r===!0||r===`true`,c.className=`check`,c.append(t,l),a.input=t}else if(n.type===`select`){let t=e.createElement(`select`);for(let r of n.options||[]){let n=e.createElement(`option`);n.textContent=o(r.label,i),t.append(n)}let s=(n.options||[]).findIndex(e=>String(e.value)===w(r));t.selectedIndex=s===-1?0:s,c.append(l,t),a.input=t}else if(n.type===`text`&&(n.minRows||1)>1){let t=e.createElement(`textarea`);t.rows=n.minRows||2,t.value=w(r),c.append(l,t),a.input=t}else{let t=e.createElement(`input`),i=w(r);switch(n.type){case`number`:case`slider`:t.type=n.type===`slider`?`range`:`number`,n.min!==void 0&&(t.min=String(n.min)),n.max!==void 0&&(t.max=String(n.max)),t.step=n.step===void 0?`any`:String(n.step);break;case`password`:t.type=`password`;break;case`color`:t.type=!i||/^#[0-9a-f]{6}$/i.test(i)?`color`:`text`;break;default:t.type=`text`}if(t.value=i,t.type===`range`){let n=e.createElement(`output`);n.textContent=t.value,t.addEventListener(`input`,()=>n.textContent=t.value),l.append(`: `,n)}c.append(l,t),a.input=t}if(n.help){let t=e.createElement(`span`);t.className=`help`,t.textContent=o(n.help,i),c.append(t)}return a}function D(e,t={}){let n=t.lang||`en`,a=document,c=e=>x[e][n]||x[e].en||e,l=a.createElement(`div`);l.setAttribute(`data-iob-dialog`,``);let d=l.attachShadow({mode:`open`}),f=a.createElement(`style`);f.textContent=S;let p=a.createElement(`dialog`),m=_(t.theme);p.className=m.type===`dark`?`dark`:``;for(let[e,t]of Object.entries(b(m)))p.style.setProperty(e,t);e.width&&(p.style.width=`${e.width}px`),e.height&&(p.style.height=`${e.height}px`);let h=a.createElement(`form`),g=a.createElement(`header`),v=a.createElement(`span`);v.textContent=o(e.title,n);let y=a.createElement(`button`);y.type=`button`,y.className=`close`,y.title=c(`close`),y.setAttribute(`aria-label`,c(`close`)),y.textContent=`×`,g.append(v,y);let C=a.createElement(`div`);return C.className=`body`,h.append(g,C),p.append(h),d.append(f,p),new Promise(t=>{let f=!1,m=e=>{f||(f=!0,p.open&&p.close(),l.remove(),t(e))};if(y.addEventListener(`click`,()=>m(null)),p.addEventListener(`close`,()=>m(null)),h.addEventListener(`submit`,e=>e.preventDefault()),i(e)){let t={},r=[];for(let[t,i]of Object.entries(e.form.items||{})){let o=e.data?.[t]??i.default,s=E(a,t,i,o,n);r.push(s),C.append(s.box)}let i=()=>{for(let e of r)e.input&&(t[e.name]=T(e));return t},l=()=>{let e=i();for(let t of r)t.box.hidden=t.hidden?t.hidden(e):!1,t.input&&(t.input.disabled=t.disabled?t.disabled(e):!1)};h.addEventListener(`input`,l),h.addEventListener(`change`,l),l();let d=r.find(e=>e.input&&!e.box.hidden&&!e.input.disabled);d?.input&&(d.input.autofocus=!0);let f=a.createElement(`footer`),p=a.createElement(`button`);p.type=`button`,p.textContent=o(e.cancel,n)||c(`cancel`),p.addEventListener(`click`,()=>m(null));let g=a.createElement(`button`);g.type=`submit`,g.className=`primary`,g.textContent=o(e.ok,n)||c(`ok`),f.append(p,g),h.append(f),h.addEventListener(`submit`,()=>m(u(s(e.form),i())))}else C.append(e.element),p.addEventListener(r,e=>m(e.detail??null));a.body.append(l),p.showModal(),d.activeElement&&d.activeElement!==y||(p.tabIndex=-1,p.focus())})}function O(e){return[...new Set(e.filter(e=>typeof e==`string`&&!!e))]}var k=[`socket`,`dialogs`,`theme`,`editMode`,`settings`,`value`],A=class extends HTMLElement{states={};objects={};#e=null;#t={};#n=_(`light`);#r=!1;#i=null;#a=void 0;#o=null;#s=!1;#c=(e,t)=>{this.#o?.states.includes(e)&&(this.states[e]=t||null,this.#_())};#l=(e,t)=>{this.#o?.objects.includes(e)&&(this.objects[e]=t||null,this.#d())};get socket(){return this.#e}set socket(e){this.#e=e||null,this.#d()}get settings(){return this.#t}set settings(e){this.#t=e||{},this.#d()}get theme(){return this.#n}set theme(e){let t=_(e);v(t,this.#n)||(this.#n=t,this.#u(),this.#_())}get editMode(){return this.#r}set editMode(e){let t=!!e;t!==this.#r&&(this.#r=t,this.#_())}get dialogs(){return this.#i}set dialogs(e){this.#i=e||null}get value(){return this.#a}set value(e){e!==this.#a&&(this.#a=e,this.#_())}connectedCallback(){for(let e of k)if(Object.prototype.hasOwnProperty.call(this,e)){let t=this[e];delete this[e],this[e]=t}this.#u(),this.#d()}disconnectedCallback(){this.#g()}getStateIds(e){return[]}getObjectIds(e){return[]}get systemLang(){return this.#e?.systemLang||`en`}text(e){return o(e,this.systemLang)}setState(e,t){return this.#e&&!this.#r?this.#e.setState(e,t):Promise.resolve()}changeValue(e){return this.#r||this.emit(`iob-change`,e)?!1:(this.value=e,!0)}emit(e,t){return this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0,cancelable:!0}))}async openDialog(e){if(this.#r)return null;let t=this.#i?await this.#i.open(e):await D(e,{lang:this.systemLang,theme:this.#n});return i(e)?t&&typeof t==`object`?u(s(e.form),t):null:t??null}#u(){for(let[e,t]of Object.entries(b(this.#n)))this.style.setProperty(e,t)}#d(){if(!this.isConnected)return;let e=this.#e,t=e?O(this.getStateIds(this.#t)):[],n=e?O(this.getObjectIds(this.#t)):[];this.#o&&this.#o.socket!==e&&this.#g();let r=this.#o?.states||[],i=this.#o?.objects||[],a=r.filter(e=>!t.includes(e)),o=i.filter(e=>!n.includes(e)),s=t.filter(e=>!r.includes(e)),c=n.filter(e=>!i.includes(e));e&&a.length&&e.unsubscribeState(a,this.#c),e&&o.length&&this.#h(e,o);for(let e of a)delete this.states[e];for(let e of[...a,...o])!t.includes(e)&&!n.includes(e)&&delete this.objects[e];this.#o=e&&(t.length||n.length)?{socket:e,states:t,objects:n}:null,e&&s.length&&this.#p(e,s),e&&c.length&&this.#m(e,c),this.#_()}#f(e,t,n){return this.#o?.socket===e&&this.#o[t].includes(n)}#p(e,t){e.subscribeState(t,this.#c).catch(e=>console.warn(`<${this.localName}>: cannot subscribe ${t.join(`, `)}: ${e}`));for(let n of t)e.getState(n).then(t=>{this.#f(e,`states`,n)&&this.states[n]===void 0&&(this.states[n]=t||null,this.#_())}).catch(()=>{}),e.getObject(n).then(t=>{this.#f(e,`states`,n)&&!this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#_())}).catch(()=>{})}#m(e,t){e.subscribeObject(t,this.#l).catch(e=>console.warn(`<${this.localName}>: cannot subscribe the objects ${t.join(`, `)}: ${e}`));for(let n of t)e.getObject(n).then(t=>{this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#d())}).catch(()=>{})}#h(e,t){e.unsubscribeObject(t,this.#l).catch(()=>{})}#g(){if(this.#o){let{socket:e,states:t,objects:n}=this.#o;t.length&&e.unsubscribeState(t,this.#c),n.length&&this.#h(e,n),this.#o=null}this.states={},this.objects={}}#_(){this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.isConnected&&this.render()}))}};function j(e,t){let n=typeof e==`string`?e:e.tag;customElements.get(n)||customElements.define(n,t)}function M(e){return`iob-nmea-${e}`}var N=`M11 3 4 15h7V3zm2 1v11h7L13 4zM3 17l1.5 3h15l1.5-3H3z`;function P({text:n,editMode:r}){return/* @__PURE__ */ t(`div`,{className:`hint${r?` edit`:``}`,children:[/* @__PURE__ */ e(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:/* @__PURE__ */ e(`path`,{d:N})}),/* @__PURE__ */ e(`span`,{children:n})]})}var F={wind:{en:`NMEA Wind`,de:`NMEA-Wind`,ru:`NMEA Ветер`,pt:`Vento NMEA`,nl:`NMEA-wind`,fr:`Vent NMEA`,it:`Vento NMEA`,es:`Viento NMEA`,pl:`Wiatr NMEA`,uk:`NMEA Вітер`,"zh-cn":`NMEA 风`},"history-chart":{en:`NMEA Chart`,de:`NMEA-Diagramm`,ru:`NMEA График`,pt:`Gráfico NMEA`,nl:`NMEA-grafiek`,fr:`Graphique NMEA`,it:`Grafico NMEA`,es:`Gráfico NMEA`,pl:`Wykres NMEA`,uk:`NMEA Графік`,"zh-cn":`NMEA 图表`},autopilot:{en:`NMEA Autopilot`,de:`NMEA-Autopilot`,ru:`NMEA Автопилот`,pt:`Piloto automático NMEA`,nl:`NMEA-stuurautomaat`,fr:`Pilote automatique NMEA`,it:`Autopilota NMEA`,es:`Piloto automático NMEA`,pl:`Autopilot NMEA`,uk:`NMEA Автопілот`,"zh-cn":`NMEA 自动驾驶仪`},"ais-radar":{en:`NMEA AIS Radar`,de:`NMEA-AIS-Radar`,ru:`NMEA AIS-радар`,pt:`Radar AIS NMEA`,nl:`NMEA AIS-radar`,fr:`Radar AIS NMEA`,it:`Radar AIS NMEA`,es:`Radar AIS NMEA`,pl:`Radar AIS NMEA`,uk:`NMEA AIS-радар`,"zh-cn":`NMEA AIS 雷达`},"anchor-position":{en:`NMEA Anchor Position`,de:`NMEA-Ankerposition`,ru:`NMEA Позиция якоря`,pt:`Posição da âncora NMEA`,nl:`NMEA-ankerpositie`,fr:`Position d'ancre NMEA`,it:`Posizione dell'ancora NMEA`,es:`Posición del ancla NMEA`,pl:`Pozycja kotwicy NMEA`,uk:`NMEA Позиція якоря`,"zh-cn":`NMEA 锚位`},instrument:{en:`Instrument`,de:`Instrument`,ru:`Инструмент`,pt:`Instrumento`,nl:`Instrument`,fr:`Instrument`,it:`Strumento`,es:`Instrumento`,pl:`Instrument`,uk:`Інструмент`,"zh-cn":`乐器`},compass:{en:`NMEA Compass`,de:`NMEA-Kompass`,ru:`NMEA Компас`,pt:`Bússola NMEA`,nl:`NMEA-kompas`,fr:`Compas NMEA`,it:`Bussola NMEA`,es:`Compás NMEA`,pl:`Kompas NMEA`,uk:`NMEA Компас`,"zh-cn":`NMEA 罗经`},rudder:{en:`NMEA Rudder`,de:`NMEA-Ruder`,ru:`NMEA Руль`,pt:`Leme NMEA`,nl:`NMEA-roer`,fr:`Gouvernail NMEA`,it:`Timone NMEA`,es:`Timón NMEA`,pl:`Ster NMEA`,uk:`NMEA Кермо`,"zh-cn":`NMEA 舵`}};function I(e,t,n){if(e==null||!Number.isFinite(e))return`—`;let r=e.toFixed(t);return n?r.replace(`.`,`,`):r}var L={chooseInstance:`Choose an instance of the NMEA adapter in the settings`,chooseState:`Choose a state in the settings`,noValues:`Choose the states to show in the settings`,waiting:`waiting for samples…`,min:`min`,avg:`avg`,max:`max`,noPosition:`No own position`,targets:`targets`,seen:`seen`,distance:`distance`,chain:`chain`,atDrop:`at drop`,depth:`depth`,alarm:`Alarm`,armed:`armed`,off:`off`,radius:`Radius`,dropHere:`Anchor here`,map:`Map`,satellite:`Satellite`,noAnchor:`No anchor position`,zoomIn:`Zoom in`,zoomOut:`Zoom out`,northUp:`North up`,courseUp:`Course up`,mode:`Mode`,lock:`Lock`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`No drift`,confirmTitle:`Confirm large change`,lockedHeading:`Locked heading`,now:`now`,new:`new`,autoCancel:`Cancelled automatically in`,cancel:`Cancel`,confirm:`Confirm`,port:`PORT`,starboard:`STBD`},R={en:L,de:{chooseInstance:`Wählen Sie in den Einstellungen eine Instanz des NMEA-Adapters`,chooseState:`Wählen Sie in den Einstellungen einen Datenpunkt`,noValues:`Wählen Sie in den Einstellungen die anzuzeigenden Datenpunkte`,waiting:`warte auf Werte…`,min:`Min`,avg:`Mittel`,max:`Max`,noPosition:`Keine eigene Position`,targets:`Ziele`,seen:`gesehen`,distance:`Abstand`,chain:`Kette`,atDrop:`beim Ankern`,depth:`Tiefe`,alarm:`Alarm`,armed:`scharf`,off:`aus`,radius:`Radius`,dropHere:`Anker hier`,map:`Karte`,satellite:`Satellit`,noAnchor:`Keine Ankerposition`,zoomIn:`Vergrößern`,zoomOut:`Verkleinern`,northUp:`Norden oben`,courseUp:`Kurs oben`,mode:`Modus`,lock:`Soll`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`Ohne Drift`,confirmTitle:`Große Änderung bestätigen`,lockedHeading:`Gehaltener Kurs`,now:`jetzt`,new:`neu`,autoCancel:`Automatischer Abbruch in`,cancel:`Abbrechen`,confirm:`Bestätigen`,port:`BB`,starboard:`STB`},ru:{chooseInstance:`Выберите в настройках экземпляр адаптера NMEA`,chooseState:`Выберите в настройках состояние`,noValues:`Выберите в настройках отображаемые состояния`,waiting:`ожидание данных…`,min:`мин`,avg:`сред`,max:`макс`,noPosition:`Нет собственной позиции`,targets:`целей`,seen:`замечен`,distance:`расстояние`,chain:`цепь`,atDrop:`при отдаче`,depth:`глубина`,alarm:`Тревога`,armed:`включена`,off:`выкл`,radius:`Радиус`,dropHere:`Якорь здесь`,map:`Карта`,satellite:`Спутник`,noAnchor:`Нет позиции якоря`,zoomIn:`Приблизить`,zoomOut:`Отдалить`,northUp:`Север вверху`,courseUp:`Курс вверху`,mode:`Режим`,lock:`Задан`,modeStandby:`Ожидание`,modeAuto:`Авто`,modeWind:`Ветер`,modeTrack:`Трек`,modeNoDrift:`Без дрейфа`,confirmTitle:`Подтвердите большое изменение`,lockedHeading:`Заданный курс`,now:`сейчас`,new:`новый`,autoCancel:`Автоматическая отмена через`,cancel:`Отмена`,confirm:`Подтвердить`,port:`ЛБ`,starboard:`ПБ`},pt:{chooseInstance:`Escolha uma instância do adaptador NMEA nas definições`,chooseState:`Escolha um estado nas definições`,noValues:`Escolha os estados a mostrar nas definições`,waiting:`aguardando dados…`,min:`mín`,avg:`méd`,max:`máx`,noPosition:`Sem posição própria`,targets:`alvos`,seen:`visto`,distance:`distância`,chain:`corrente`,atDrop:`ao fundear`,depth:`profundidade`,alarm:`Alarme`,armed:`ativo`,off:`desligado`,radius:`Raio`,dropHere:`Âncora aqui`,map:`Mapa`,satellite:`Satélite`,noAnchor:`Sem posição da âncora`,zoomIn:`Aproximar`,zoomOut:`Afastar`,northUp:`Norte para cima`,courseUp:`Rumo para cima`,mode:`Modo`,lock:`Fixo`,modeStandby:`Espera`,modeAuto:`Auto`,modeWind:`Vento`,modeTrack:`Rota`,modeNoDrift:`Sem deriva`,confirmTitle:`Confirmar grande alteração`,lockedHeading:`Rumo fixado`,now:`agora`,new:`novo`,autoCancel:`Cancelamento automático em`,cancel:`Cancelar`,confirm:`Confirmar`,port:`BB`,starboard:`EB`},nl:{chooseInstance:`Kies in de instellingen een instantie van de NMEA-adapter`,chooseState:`Kies in de instellingen een status`,noValues:`Kies in de instellingen de te tonen statussen`,waiting:`wachten op gegevens…`,min:`min`,avg:`gem`,max:`max`,noPosition:`Geen eigen positie`,targets:`doelen`,seen:`gezien`,distance:`afstand`,chain:`ketting`,atDrop:`bij ankeren`,depth:`diepte`,alarm:`Alarm`,armed:`actief`,off:`uit`,radius:`Straal`,dropHere:`Anker hier`,map:`Kaart`,satellite:`Satelliet`,noAnchor:`Geen ankerpositie`,zoomIn:`Inzoomen`,zoomOut:`Uitzoomen`,northUp:`Noord boven`,courseUp:`Koers boven`,mode:`Modus`,lock:`Vast`,modeStandby:`Stand-by`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`Geen drift`,confirmTitle:`Grote wijziging bevestigen`,lockedHeading:`Vastgezette koers`,now:`nu`,new:`nieuw`,autoCancel:`Automatisch geannuleerd over`,cancel:`Annuleren`,confirm:`Bevestigen`,port:`BB`,starboard:`SB`},fr:{chooseInstance:`Choisissez une instance de l'adaptateur NMEA dans les paramètres`,chooseState:`Choisissez un état dans les paramètres`,noValues:`Choisissez les états à afficher dans les paramètres`,waiting:`en attente de données…`,min:`min`,avg:`moy`,max:`max`,noPosition:`Pas de position propre`,targets:`cibles`,seen:`vu`,distance:`distance`,chain:`chaîne`,atDrop:`au mouillage`,depth:`profondeur`,alarm:`Alarme`,armed:`armée`,off:`arrêt`,radius:`Rayon`,dropHere:`Ancre ici`,map:`Carte`,satellite:`Satellite`,noAnchor:`Pas de position d'ancre`,zoomIn:`Zoom avant`,zoomOut:`Zoom arrière`,northUp:`Nord en haut`,courseUp:`Cap en haut`,mode:`Mode`,lock:`Consigne`,modeStandby:`Veille`,modeAuto:`Auto`,modeWind:`Vent`,modeTrack:`Route`,modeNoDrift:`Sans dérive`,confirmTitle:`Confirmer un grand changement`,lockedHeading:`Cap verrouillé`,now:`actuel`,new:`nouveau`,autoCancel:`Annulation automatique dans`,cancel:`Annuler`,confirm:`Confirmer`,port:`BÂB`,starboard:`TRIB`},it:{chooseInstance:`Scegli un'istanza dell'adattatore NMEA nelle impostazioni`,chooseState:`Scegli uno stato nelle impostazioni`,noValues:`Scegli gli stati da mostrare nelle impostazioni`,waiting:`in attesa di dati…`,min:`min`,avg:`media`,max:`max`,noPosition:`Nessuna posizione propria`,targets:`bersagli`,seen:`visto`,distance:`distanza`,chain:`catena`,atDrop:`all'ancoraggio`,depth:`profondità`,alarm:`Allarme`,armed:`attivo`,off:`spento`,radius:`Raggio`,dropHere:`Ancora qui`,map:`Mappa`,satellite:`Satellite`,noAnchor:`Nessuna posizione dell'ancora`,zoomIn:`Ingrandisci`,zoomOut:`Riduci`,northUp:`Nord in alto`,courseUp:`Rotta in alto`,mode:`Modalità`,lock:`Impostata`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Vento`,modeTrack:`Rotta`,modeNoDrift:`Senza deriva`,confirmTitle:`Conferma grande modifica`,lockedHeading:`Rotta bloccata`,now:`ora`,new:`nuovo`,autoCancel:`Annullamento automatico tra`,cancel:`Annulla`,confirm:`Conferma`,port:`SX`,starboard:`DX`},es:{chooseInstance:`Elija una instancia del adaptador NMEA en la configuración`,chooseState:`Elija un estado en la configuración`,noValues:`Elija los estados a mostrar en la configuración`,waiting:`esperando datos…`,min:`mín`,avg:`med`,max:`máx`,noPosition:`Sin posición propia`,targets:`objetivos`,seen:`visto`,distance:`distancia`,chain:`cadena`,atDrop:`al fondear`,depth:`profundidad`,alarm:`Alarma`,armed:`activa`,off:`apagada`,radius:`Radio`,dropHere:`Ancla aquí`,map:`Mapa`,satellite:`Satélite`,noAnchor:`Sin posición del ancla`,zoomIn:`Acercar`,zoomOut:`Alejar`,northUp:`Norte arriba`,courseUp:`Rumbo arriba`,mode:`Modo`,lock:`Fijado`,modeStandby:`En espera`,modeAuto:`Auto`,modeWind:`Viento`,modeTrack:`Ruta`,modeNoDrift:`Sin deriva`,confirmTitle:`Confirmar cambio grande`,lockedHeading:`Rumbo fijado`,now:`ahora`,new:`nuevo`,autoCancel:`Cancelación automática en`,cancel:`Cancelar`,confirm:`Confirmar`,port:`BB`,starboard:`EB`},pl:{chooseInstance:`Wybierz w ustawieniach instancję adaptera NMEA`,chooseState:`Wybierz w ustawieniach stan`,noValues:`Wybierz w ustawieniach stany do wyświetlenia`,waiting:`oczekiwanie na dane…`,min:`min`,avg:`śr`,max:`maks`,noPosition:`Brak własnej pozycji`,targets:`celów`,seen:`widziany`,distance:`odległość`,chain:`łańcuch`,atDrop:`przy kotwiczeniu`,depth:`głębokość`,alarm:`Alarm`,armed:`uzbrojony`,off:`wył.`,radius:`Promień`,dropHere:`Kotwica tutaj`,map:`Mapa`,satellite:`Satelita`,noAnchor:`Brak pozycji kotwicy`,zoomIn:`Powiększ`,zoomOut:`Pomniejsz`,northUp:`Północ u góry`,courseUp:`Kurs u góry`,mode:`Tryb`,lock:`Zadany`,modeStandby:`Czuwanie`,modeAuto:`Auto`,modeWind:`Wiatr`,modeTrack:`Trasa`,modeNoDrift:`Bez dryfu`,confirmTitle:`Potwierdź dużą zmianę`,lockedHeading:`Zablokowany kurs`,now:`teraz`,new:`nowy`,autoCancel:`Automatyczne anulowanie za`,cancel:`Anuluj`,confirm:`Potwierdź`,port:`LB`,starboard:`PB`},uk:{chooseInstance:`Виберіть у налаштуваннях екземпляр адаптера NMEA`,chooseState:`Виберіть у налаштуваннях стан`,noValues:`Виберіть у налаштуваннях стани для відображення`,waiting:`очікування даних…`,min:`мін`,avg:`сер`,max:`макс`,noPosition:`Немає власної позиції`,targets:`цілей`,seen:`помічено`,distance:`відстань`,chain:`ланцюг`,atDrop:`при віддачі`,depth:`глибина`,alarm:`Тривога`,armed:`увімкнено`,off:`вимк`,radius:`Радіус`,dropHere:`Якір тут`,map:`Карта`,satellite:`Супутник`,noAnchor:`Немає позиції якоря`,zoomIn:`Наблизити`,zoomOut:`Віддалити`,northUp:`Північ угорі`,courseUp:`Курс угорі`,mode:`Режим`,lock:`Задано`,modeStandby:`Очікування`,modeAuto:`Авто`,modeWind:`Вітер`,modeTrack:`Трек`,modeNoDrift:`Без дрейфу`,confirmTitle:`Підтвердьте велику зміну`,lockedHeading:`Заданий курс`,now:`зараз`,new:`новий`,autoCancel:`Автоматичне скасування через`,cancel:`Скасувати`,confirm:`Підтвердити`,port:`ЛБ`,starboard:`ПБ`},"zh-cn":{chooseInstance:`请在设置中选择一个 NMEA 适配器实例`,chooseState:`请在设置中选择一个状态`,noValues:`请在设置中选择要显示的状态`,waiting:`等待数据…`,min:`最小`,avg:`平均`,max:`最大`,noPosition:`没有本船位置`,targets:`个目标`,seen:`最后出现`,distance:`距离`,chain:`锚链`,atDrop:`抛锚时`,depth:`水深`,alarm:`警报`,armed:`已启用`,off:`关闭`,radius:`半径`,dropHere:`在此抛锚`,map:`地图`,satellite:`卫星`,noAnchor:`没有锚位`,zoomIn:`放大`,zoomOut:`缩小`,northUp:`北向上`,courseUp:`航向向上`,mode:`模式`,lock:`锁定`,modeStandby:`待机`,modeAuto:`自动`,modeWind:`风向`,modeTrack:`航迹`,modeNoDrift:`无漂移`,confirmTitle:`确认大幅更改`,lockedHeading:`锁定航向`,now:`当前`,new:`新`,autoCancel:`自动取消倒计时`,cancel:`取消`,confirm:`确认`,port:`左舷`,starboard:`右舷`}};function z(e,t){return(R[e]||L)[t]||L[t]}var B=`
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
`,V=`system.config`,H=class extends A{#e;#t;#n=/* @__PURE__ */ new Set;#r=null;#i=null;#a=0;tickMs=0;throttleMs=0;constructor(e){super();let t=this.attachShadow({mode:`open`}),r=document.createElement(`style`);r.textContent=B+e,this.#t=document.createElement(`div`),this.#t.className=`mount`,t.append(r,this.#t),this.#e=n(this.#t)}connectedCallback(){super.connectedCallback(),this.tickMs&&!this.#r&&(this.#r=setInterval(()=>{!document.hidden&&this.isConnected&&this.render()},this.tickMs))}disconnectedCallback(){super.disconnectedCallback(),this.#r&&=(clearInterval(this.#r),null),this.#i&&=(clearTimeout(this.#i),null)}getObjectIds(e){return[V]}get isFloatComma(){return!!this.objects[V]?.common?.isFloatComma}get defaultHistory(){return this.objects[`system.config`]?.common?.defaultHistory||``}word(e){return z(this.systemLang,e)}num(e){if(!e)return null;let t=this.states[e]?.val;if(t==null||t===``)return null;let n=typeof t==`string`?parseFloat(t.replace(`,`,`.`)):Number(t);return Number.isFinite(n)?n:null}render(){if(this.throttleMs){let e=this.#a+this.throttleMs-Date.now();if(e>0){this.#i||=setTimeout(()=>{this.#i=null,this.isConnected&&this.render()},e);return}}this.#a=Date.now(),this.#t.classList.toggle(`light`,this.theme.type===`light`),this.#e.render(this.renderContent());for(let e of this.#n)e()}async showElementDialog(e){if(this.editMode)return null;let t=document.createElement(`div`);t.style.width=`100%`,t.style.height=`100%`;let i=t.attachShadow({mode:`open`}),a=document.createElement(`style`);a.textContent=B+e.css;let o=document.createElement(`div`);o.className=e.fit?`mount dialog fit`:`mount dialog`,i.append(a,o);let s=n(o),c=(e=null)=>{t.dispatchEvent(new CustomEvent(r,{detail:e,bubbles:!0,composed:!0}))},l=()=>{for(let[e,n]of Object.entries(b(this.theme)))t.style.setProperty(e,n);o.classList.toggle(`light`,this.theme.type===`light`),s.render(e.draw(c))};this.#n.add(l),l();try{return await this.openDialog({title:e.title,element:t,width:e.width,height:e.height})}finally{this.#n.delete(l),s.unmount()}}},U=60,W=1,G=2e3,K=600,q=400,J=388,Y=`
.chart {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: clamp(4px, 3cqmin, 12px);
    box-sizing: border-box;
    gap: 2px;
}
.header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
}
.label {
    font-size: clamp(11px, 9cqh, 22px);
    font-weight: 600;
    color: var(--iob-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.value {
    font-size: clamp(16px, 20cqh, 64px);
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
}
.value .unit {
    font-size: 0.45em;
    font-weight: 500;
    margin-left: 0.2em;
    color: var(--iob-text-secondary);
}
.plot {
    position: relative;
    flex: 1;
    min-height: 0;
}
.plot svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}
.ref {
    stroke-width: 2px;
    stroke-dasharray: 12 6;
    opacity: 0.85;
}
.ref.min { stroke: #5fb3ff; }
.ref.avg { stroke: var(--iob-text-secondary); }
.ref.max { stroke: #ff9100; }
.pill {
    position: absolute;
    right: 4px;
    transform: translateY(-50%);
    font-size: clamp(9px, 6cqh, 14px);
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--iob-paper);
    border: 1px solid currentColor;
    white-space: nowrap;
    line-height: 1.3;
}
.pill.min { color: #2f8fe0; }
.pill.avg { color: var(--iob-text-secondary); }
.pill.max { color: #e67e00; }
.waiting {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--iob-text-secondary);
    font-size: clamp(11px, 8cqmin, 16px);
}
@container (max-height: 110px) {
    .header { display: none; }
}
@container (max-height: 70px) {
    .pill { display: none; }
}
`;function X(e,t,n){let r=Math.max(1,t.historySeconds??U)*1e3,i=n-r,a=e.filter(e=>e.ts>=i&&e.ts<=n),o=[...e].reverse().find(e=>e.ts<i);if(e.length&&e[e.length-1].ts<n&&a.push({val:e[e.length-1].val,ts:n}),o&&a[0]&&o.ts<a[0].ts){let e=(i-o.ts)/(a[0].ts-o.ts);a.unshift({val:o.val+(a[0].val-o.val)*e,ts:i})}let s=null,c=null,l=null;a.length&&(s=Math.min(...a.map(e=>e.val)),c=Math.max(...a.map(e=>e.val)),l=a.reduce((e,t)=>e+t.val,0)/a.length);let u=t.yMin??0,d=t.yMax??0,f=d>u,p,m;t.autoScale??!0?(p=Math.min(u,s??u),m=Math.max(f?d:u+1,c===null?u+1:c*1.1)):(p=u,m=f?d:u+1),m<=p&&(m=p+1);let h=e=>(e-i)/r*K,g=e=>J-(Math.max(p,Math.min(m,e))-p)/(m-p)*376,_=[];for(let e of a){let t=`${h(e.ts).toFixed(1)},${g(e.val).toFixed(1)}`;_[_.length-1]!==t&&_.push(t)}let v=``;if(_.length){let e=_[0].split(`,`),t=_[_.length-1].split(`,`);v=`M ${e[0]},${J} L ${_.join(` L `)} L ${t[0]},${J} Z`}return{line:_.join(` `),area:v,min:s,avg:l,max:c,yFor:g}}var Z=class extends H{#e=[];#t=``;#n=``;constructor(){super(Y),this.tickMs=200}getStateIds(e){return e.stateId?[e.stateId]:[]}#r(e){this.#t!==e&&(this.#t=e,this.#e=[]);let t=Date.now(),n=this.states[e],r=this.num(e),i=this.#e,a=i[i.length-1];r!==null&&n?.ts&&(!a||n.ts>a.ts)?i.push({val:r,ts:n.ts}):a&&t-a.ts>G&&r!==null&&i.push({val:a.val,ts:t});let o=t-Math.max(1,this.settings.historySeconds??U)*1e3,s=i.findIndex(e=>e.ts>=o);s>1&&i.splice(0,s-1)}async#i(e){let t=this.socket,n=this.defaultHistory,r=this.objects[e];if(!t||!n||!r?.common?.custom?.[n])return;let i=Date.now(),a=i-Math.max(1,this.settings.historySeconds??U)*1e3;try{let r=await t.getHistory(e,{instance:n,start:a,end:i,aggregate:`none`});if(this.#t!==e||!Array.isArray(r))return;let o=new Set(this.#e.map(e=>e.ts)),s=[];for(let e of r){let t=Number(e.val);Number.isFinite(t)&&e.ts&&!o.has(e.ts)&&s.push({val:t,ts:e.ts})}this.#e=[...s,...this.#e].sort((e,t)=>e.ts-t.ts),this.isConnected&&this.render()}catch{}}#a=()=>{this.editMode||this.showElementDialog({title:this.#o()||this.text(F[`history-chart`]),css:Y,width:1e3,height:600,draw:()=>this.#s()})};#o(){let e=this.settings,t=e.stateId?this.objects[e.stateId]:null;return e.label||(t?.common?.name?this.text(t.common.name):``)}#s(){let n=this.settings,r=n.stateId||``,i=this.objects[r],a=n.unit||i?.common?.unit||``,o=n.decimals??W,s=this.isFloatComma,c=X(this.#e,n,Date.now()),l=this.#e.length?this.#e[this.#e.length-1].val:this.num(r),u=n.color||`var(--iob-primary)`,d=[`min`,`avg`,`max`].filter(e=>c[e]!==null&&(n[e===`min`?`showMin`:e===`avg`?`showAvg`:`showMax`]??e===`avg`));return/* @__PURE__ */ t(`div`,{className:`chart`,children:[/* @__PURE__ */ t(`div`,{className:`header`,children:[/* @__PURE__ */ e(`span`,{className:`label`,children:this.#o()}),/* @__PURE__ */ t(`span`,{className:`value`,style:{color:u},children:[I(l,o,s),a?/* @__PURE__ */ e(`span`,{className:`unit`,children:a}):null]})]}),/* @__PURE__ */ t(`div`,{className:`plot`,children:[/* @__PURE__ */ t(`svg`,{viewBox:`0 0 ${K} ${q}`,preserveAspectRatio:`none`,children:[c.area?/* @__PURE__ */ e(`path`,{d:c.area,style:{fill:u},fillOpacity:.22}):null,c.line?/* @__PURE__ */ e(`polyline`,{points:c.line,fill:`none`,style:{stroke:u},strokeWidth:3,strokeLinejoin:`round`,strokeLinecap:`round`,vectorEffect:`non-scaling-stroke`}):null,d.map(t=>/* @__PURE__ */ e(`line`,{className:`ref ${t}`,x1:0,x2:K,y1:c.yFor(c[t]),y2:c.yFor(c[t]),vectorEffect:`non-scaling-stroke`},t))]}),d.map(t=>/* @__PURE__ */ e(`span`,{className:`pill ${t}`,style:{top:`${c.yFor(c[t])/q*100}%`},children:`${this.word(t)} ${I(c[t],o,s)}`},t)),c.line?null:/* @__PURE__ */ e(`div`,{className:`waiting`,children:this.word(`waiting`)})]})]})}renderContent(){let t=this.settings.stateId;return t?(this.#r(t),this.#n!==t&&this.socket&&this.objects[t]!==void 0&&this.objects[`system.config`]!==void 0&&(this.#n=t,this.#i(t)),/* @__PURE__ */ e(`div`,{className:`fill${this.editMode?` edit`:` clickable`}`,role:`button`,tabIndex:this.editMode?void 0:0,onClick:this.#a,onKeyDown:e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),this.#a())},children:this.#s()})):/* @__PURE__ */ e(P,{text:this.word(`chooseState`),editMode:this.editMode})}};j(M(`history-chart`),Z);