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
`;function C(e){if(!e)return null;try{let t=Function(`data`,`return (${e});`);return e=>{try{return!!t(e)}catch{return!1}}}catch{return null}}function w(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?String(e):``}function T(e){let{input:t,setting:n}=e;if(t)return t instanceof HTMLInputElement&&t.type===`checkbox`?t.checked:t instanceof HTMLSelectElement?n.options?.[t.selectedIndex]?.value:t.value}function te(e,t,n,r,i){let a={name:t,setting:n,box:e.createElement(`div`),hidden:C(n.hidden),disabled:C(n.disabled)},o=s(n.label,i);switch(n.type){case`header`:return a.box=e.createElement(`h3`),a.box.textContent=s(n.text,i)||o,a;case`staticText`:return a.box=e.createElement(`p`),a.box.textContent=s(n.text,i)||o,a;case`divider`:return a.box=e.createElement(`hr`),a}let c=e.createElement(`label`);a.box=c;let l=e.createElement(`span`);if(l.textContent=o||t,n.type===`checkbox`){let t=e.createElement(`input`);t.type=`checkbox`,t.checked=r===!0||r===`true`,c.className=`check`,c.append(t,l),a.input=t}else if(n.type===`select`){let t=e.createElement(`select`);for(let r of n.options||[]){let n=e.createElement(`option`);n.textContent=s(r.label,i),t.append(n)}let o=(n.options||[]).findIndex(e=>String(e.value)===w(r));t.selectedIndex=o===-1?0:o,c.append(l,t),a.input=t}else if(n.type===`text`&&(n.minRows||1)>1){let t=e.createElement(`textarea`);t.rows=n.minRows||2,t.value=w(r),c.append(l,t),a.input=t}else{let t=e.createElement(`input`),i=w(r);switch(n.type){case`number`:case`slider`:t.type=n.type===`slider`?`range`:`number`,n.min!==void 0&&(t.min=String(n.min)),n.max!==void 0&&(t.max=String(n.max)),t.step=n.step===void 0?`any`:String(n.step);break;case`password`:t.type=`password`;break;case`color`:t.type=!i||/^#[0-9a-f]{6}$/i.test(i)?`color`:`text`;break;default:t.type=`text`}if(t.value=i,t.type===`range`){let n=e.createElement(`output`);n.textContent=t.value,t.addEventListener(`input`,()=>n.textContent=t.value),l.append(`: `,n)}c.append(l,t),a.input=t}if(n.help){let t=e.createElement(`span`);t.className=`help`,t.textContent=s(n.help,i),c.append(t)}return a}function ne(e,t={}){let n=t.lang||`en`,r=document,o=e=>S[e][n]||S[e].en||e,l=r.createElement(`div`);l.setAttribute(`data-iob-dialog`,``);let u=l.attachShadow({mode:`open`}),f=r.createElement(`style`);f.textContent=ee;let p=r.createElement(`dialog`),m=v(t.theme);p.className=m.type===`dark`?`dark`:``;for(let[e,t]of Object.entries(x(m)))p.style.setProperty(e,t);e.width&&(p.style.width=`${e.width}px`),e.height&&(p.style.height=`${e.height}px`);let h=r.createElement(`form`),g=r.createElement(`header`),_=r.createElement(`span`);_.textContent=s(e.title,n);let y=r.createElement(`button`);y.type=`button`,y.className=`close`,y.title=o(`close`),y.setAttribute(`aria-label`,o(`close`)),y.textContent=`×`,g.append(_,y);let b=r.createElement(`div`);return b.className=`body`,h.append(g,b),p.append(h),u.append(f,p),new Promise(t=>{let f=!1,m=e=>{f||(f=!0,p.open&&p.close(),l.remove(),t(e))};if(y.addEventListener(`click`,()=>m(null)),p.addEventListener(`close`,()=>m(null)),h.addEventListener(`submit`,e=>e.preventDefault()),a(e)){let t={},i=[];for(let[t,a]of Object.entries(e.form.items||{})){let o=e.data?.[t]??a.default,s=te(r,t,a,o,n);i.push(s),b.append(s.box)}let a=()=>{for(let e of i)e.input&&(t[e.name]=T(e));return t},l=()=>{let e=a();for(let t of i)t.box.hidden=t.hidden?t.hidden(e):!1,t.input&&(t.input.disabled=t.disabled?t.disabled(e):!1)};h.addEventListener(`input`,l),h.addEventListener(`change`,l),l();let u=i.find(e=>e.input&&!e.box.hidden&&!e.input.disabled);u?.input&&(u.input.autofocus=!0);let f=r.createElement(`footer`),p=r.createElement(`button`);p.type=`button`,p.textContent=s(e.cancel,n)||o(`cancel`),p.addEventListener(`click`,()=>m(null));let g=r.createElement(`button`);g.type=`submit`,g.className=`primary`,g.textContent=s(e.ok,n)||o(`ok`),f.append(p,g),h.append(f),h.addEventListener(`submit`,()=>m(d(c(e.form),a())))}else b.append(e.element),p.addEventListener(i,e=>m(e.detail??null));r.body.append(l),p.showModal(),u.activeElement&&u.activeElement!==y||(p.tabIndex=-1,p.focus())})}function E(e){return[...new Set(e.filter(e=>typeof e==`string`&&!!e))]}var re=[`socket`,`dialogs`,`theme`,`editMode`,`settings`,`value`],D=class extends HTMLElement{states={};objects={};#e=null;#t={};#n=v(`light`);#r=!1;#i=null;#a=void 0;#o=null;#s=!1;#c=(e,t)=>{this.#o?.states.includes(e)&&(this.states[e]=t||null,this.#_())};#l=(e,t)=>{this.#o?.objects.includes(e)&&(this.objects[e]=t||null,this.#d())};get socket(){return this.#e}set socket(e){this.#e=e||null,this.#d()}get settings(){return this.#t}set settings(e){this.#t=e||{},this.#d()}get theme(){return this.#n}set theme(e){let t=v(e);y(t,this.#n)||(this.#n=t,this.#u(),this.#_())}get editMode(){return this.#r}set editMode(e){let t=!!e;t!==this.#r&&(this.#r=t,this.#_())}get dialogs(){return this.#i}set dialogs(e){this.#i=e||null}get value(){return this.#a}set value(e){e!==this.#a&&(this.#a=e,this.#_())}connectedCallback(){for(let e of re)if(Object.prototype.hasOwnProperty.call(this,e)){let t=this[e];delete this[e],this[e]=t}this.#u(),this.#d()}disconnectedCallback(){this.#g()}getStateIds(e){return[]}getObjectIds(e){return[]}get systemLang(){return this.#e?.systemLang||`en`}text(e){return s(e,this.systemLang)}setState(e,t){return this.#e&&!this.#r?this.#e.setState(e,t):Promise.resolve()}changeValue(e){return this.#r||this.emit(`iob-change`,e)?!1:(this.value=e,!0)}emit(e,t){return this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0,cancelable:!0}))}async openDialog(e){if(this.#r)return null;let t=this.#i?await this.#i.open(e):await ne(e,{lang:this.systemLang,theme:this.#n});return a(e)?t&&typeof t==`object`?d(c(e.form),t):null:t??null}#u(){for(let[e,t]of Object.entries(x(this.#n)))this.style.setProperty(e,t)}#d(){if(!this.isConnected)return;let e=this.#e,t=e?E(this.getStateIds(this.#t)):[],n=e?E(this.getObjectIds(this.#t)):[];this.#o&&this.#o.socket!==e&&this.#g();let r=this.#o?.states||[],i=this.#o?.objects||[],a=r.filter(e=>!t.includes(e)),o=i.filter(e=>!n.includes(e)),s=t.filter(e=>!r.includes(e)),c=n.filter(e=>!i.includes(e));e&&a.length&&e.unsubscribeState(a,this.#c),e&&o.length&&this.#h(e,o);for(let e of a)delete this.states[e];for(let e of[...a,...o])!t.includes(e)&&!n.includes(e)&&delete this.objects[e];this.#o=e&&(t.length||n.length)?{socket:e,states:t,objects:n}:null,e&&s.length&&this.#p(e,s),e&&c.length&&this.#m(e,c),this.#_()}#f(e,t,n){return this.#o?.socket===e&&this.#o[t].includes(n)}#p(e,t){e.subscribeState(t,this.#c).catch(e=>console.warn(`<${this.localName}>: cannot subscribe ${t.join(`, `)}: ${e}`));for(let n of t)e.getState(n).then(t=>{this.#f(e,`states`,n)&&this.states[n]===void 0&&(this.states[n]=t||null,this.#_())}).catch(()=>{}),e.getObject(n).then(t=>{this.#f(e,`states`,n)&&!this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#_())}).catch(()=>{})}#m(e,t){e.subscribeObject(t,this.#l).catch(e=>console.warn(`<${this.localName}>: cannot subscribe the objects ${t.join(`, `)}: ${e}`));for(let n of t)e.getObject(n).then(t=>{this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#d())}).catch(()=>{})}#h(e,t){e.unsubscribeObject(t,this.#l).catch(()=>{})}#g(){if(this.#o){let{socket:e,states:t,objects:n}=this.#o;t.length&&e.unsubscribeState(t,this.#c),n.length&&this.#h(e,n),this.#o=null}this.states={},this.objects={}}#_(){this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.isConnected&&this.render()}))}};function O(e,t){let n=typeof e==`string`?e:e.tag;customElements.get(n)||customElements.define(n,t)}function k(e){return`iob-nmea-${e}`}var A=`M11 3 4 15h7V3zm2 1v11h7L13 4zM3 17l1.5 3h15l1.5-3H3z`;function j({text:e,editMode:r}){return/* @__PURE__ */ n(`div`,{className:`hint${r?` edit`:``}`,children:[/* @__PURE__ */ t(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:/* @__PURE__ */ t(`path`,{d:A})}),/* @__PURE__ */ t(`span`,{children:e})]})}var M=Math.PI/180,N=6371e3;function P(e,t,n){if(e==null||!Number.isFinite(e))return`—`;let r=e.toFixed(t);return n?r.replace(`.`,`,`):r}function ie(e,t,n,r){let i=(e+n)*.5*M;return{east:(t-r)*M*Math.cos(i)*N,north:(e-n)*M*N}}function ae(e,t,n,r){let i=(n-e)*M,a=(r-t)*M,o=Math.sin(i/2)**2+Math.cos(e*M)*Math.cos(n*M)*Math.sin(a/2)**2;return N*2*Math.atan2(Math.sqrt(o),Math.sqrt(1-o))}var F=156543.03392,I=[`a`,`b`,`c`,`d`];function L(e){return{url:(t,n,r)=>`https://${I[(n+r)%I.length]}.basemaps.cartocdn.com/${e}/${t}/${n}/${r}@2x.png`,maxZoom:20,attribution:`© OpenStreetMap © CARTO`}}var R={dark:L(`dark_all`),voyager:L(`rastertiles/voyager`),satellite:{url:(e,t,n)=>`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${e}/${n}/${t}`,maxZoom:19,attribution:`© Esri`}};function z(e){let{source:n,lat:r,lon:i,cx:a,cy:o,metersPerUnit:s}=e,c=e.tileUnits||400;if(!Number.isFinite(r)||!Number.isFinite(i)||!(s>0)||Math.abs(r)>85)return null;let l=Math.cos(r*M),u=Math.floor(Math.log2(256*F*l/(s*c)));u=Math.max(1,Math.min(n.maxZoom,u));let d=2**u,f=F*l/d/s,p=256*f,m=Math.sin(r*M),h=(i+180)/360*256*d,g=(.5-Math.log((1+m)/(1-m))/(4*Math.PI))*256*d,_=e=>Math.floor((h+(e-a)/f)/256),v=e=>Math.floor((g+(e-o)/f)/256),y=[];for(let r=Math.max(0,v(e.y0));r<=Math.min(d-1,v(e.y1));r++)for(let i=_(e.x0);i<=_(e.x1);i++){let s=a+(i*256-h)*f,c=o+(r*256-g)*f;if(e.radius){let t=Math.max(s,Math.min(a,s+p)),n=Math.max(c,Math.min(o,c+p));if((t-a)**2+(n-o)**2>e.radius**2)continue}let l=(i%d+d)%d;y.push(/* @__PURE__ */ t(`image`,{href:n.url(u,l,r),x:s,y:c,width:p+.6,height:p+.6,preserveAspectRatio:`none`},`${u}/${l}/${r}/${i}`))}return/* @__PURE__ */ t(`g`,{className:`tiles`,children:y})}var B={wind:{en:`NMEA Wind`,de:`NMEA-Wind`,ru:`NMEA Ветер`,pt:`Vento NMEA`,nl:`NMEA-wind`,fr:`Vent NMEA`,it:`Vento NMEA`,es:`Viento NMEA`,pl:`Wiatr NMEA`,uk:`NMEA Вітер`,"zh-cn":`NMEA 风`},"history-chart":{en:`NMEA Chart`,de:`NMEA-Diagramm`,ru:`NMEA График`,pt:`Gráfico NMEA`,nl:`NMEA-grafiek`,fr:`Graphique NMEA`,it:`Grafico NMEA`,es:`Gráfico NMEA`,pl:`Wykres NMEA`,uk:`NMEA Графік`,"zh-cn":`NMEA 图表`},autopilot:{en:`NMEA Autopilot`,de:`NMEA-Autopilot`,ru:`NMEA Автопилот`,pt:`Piloto automático NMEA`,nl:`NMEA-stuurautomaat`,fr:`Pilote automatique NMEA`,it:`Autopilota NMEA`,es:`Piloto automático NMEA`,pl:`Autopilot NMEA`,uk:`NMEA Автопілот`,"zh-cn":`NMEA 自动驾驶仪`},"ais-radar":{en:`NMEA AIS Radar`,de:`NMEA-AIS-Radar`,ru:`NMEA AIS-радар`,pt:`Radar AIS NMEA`,nl:`NMEA AIS-radar`,fr:`Radar AIS NMEA`,it:`Radar AIS NMEA`,es:`Radar AIS NMEA`,pl:`Radar AIS NMEA`,uk:`NMEA AIS-радар`,"zh-cn":`NMEA AIS 雷达`},"anchor-position":{en:`NMEA Anchor Position`,de:`NMEA-Ankerposition`,ru:`NMEA Позиция якоря`,pt:`Posição da âncora NMEA`,nl:`NMEA-ankerpositie`,fr:`Position d'ancre NMEA`,it:`Posizione dell'ancora NMEA`,es:`Posición del ancla NMEA`,pl:`Pozycja kotwicy NMEA`,uk:`NMEA Позиція якоря`,"zh-cn":`NMEA 锚位`},instrument:{en:`Instrument`,de:`Instrument`,ru:`Прибор`,pt:`Instrumento`,nl:`Instrument`,fr:`Instrument`,it:`Strumento`,es:`Instrumento`,pl:`Przyrząd`,uk:`Прилад`,"zh-cn":`仪表`},compass:{en:`NMEA Compass`,de:`NMEA-Kompass`,ru:`NMEA Компас`,pt:`Bússola NMEA`,nl:`NMEA-kompas`,fr:`Compas NMEA`,it:`Bussola NMEA`,es:`Compás NMEA`,pl:`Kompas NMEA`,uk:`NMEA Компас`,"zh-cn":`NMEA 罗经`},rudder:{en:`NMEA Rudder`,de:`NMEA-Ruder`,ru:`NMEA Руль`,pt:`Leme NMEA`,nl:`NMEA-roer`,fr:`Gouvernail NMEA`,it:`Timone NMEA`,es:`Timón NMEA`,pl:`Ster NMEA`,uk:`NMEA Кермо`,"zh-cn":`NMEA 舵`}},V={chooseInstance:`Choose an instance of the NMEA adapter in the settings`,chooseState:`Choose a state in the settings`,noValues:`Choose the states to show in the settings`,waiting:`waiting for samples…`,min:`min`,avg:`avg`,max:`max`,noPosition:`No own position`,targets:`targets`,seen:`seen`,distance:`distance`,chain:`chain`,atDrop:`at drop`,depth:`depth`,alarm:`Alarm`,armed:`armed`,off:`off`,radius:`Radius`,dropHere:`Anchor here`,map:`Map`,satellite:`Satellite`,noAnchor:`No anchor position`,zoomIn:`Zoom in`,zoomOut:`Zoom out`,northUp:`North up`,courseUp:`Course up`,mode:`Mode`,lock:`Lock`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`No drift`,confirmTitle:`Confirm large change`,lockedHeading:`Locked heading`,now:`now`,new:`new`,autoCancel:`Cancelled automatically in`,cancel:`Cancel`,confirm:`Confirm`,port:`PORT`,starboard:`STBD`},H={en:V,de:{chooseInstance:`Wählen Sie in den Einstellungen eine Instanz des NMEA-Adapters`,chooseState:`Wählen Sie in den Einstellungen einen Datenpunkt`,noValues:`Wählen Sie in den Einstellungen die anzuzeigenden Datenpunkte`,waiting:`warte auf Werte…`,min:`Min`,avg:`Mittel`,max:`Max`,noPosition:`Keine eigene Position`,targets:`Ziele`,seen:`gesehen`,distance:`Abstand`,chain:`Kette`,atDrop:`beim Ankern`,depth:`Tiefe`,alarm:`Alarm`,armed:`scharf`,off:`aus`,radius:`Radius`,dropHere:`Anker hier`,map:`Karte`,satellite:`Satellit`,noAnchor:`Keine Ankerposition`,zoomIn:`Vergrößern`,zoomOut:`Verkleinern`,northUp:`Norden oben`,courseUp:`Kurs oben`,mode:`Modus`,lock:`Soll`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`Ohne Drift`,confirmTitle:`Große Änderung bestätigen`,lockedHeading:`Gehaltener Kurs`,now:`jetzt`,new:`neu`,autoCancel:`Automatischer Abbruch in`,cancel:`Abbrechen`,confirm:`Bestätigen`,port:`BB`,starboard:`STB`},ru:{chooseInstance:`Выберите в настройках экземпляр адаптера NMEA`,chooseState:`Выберите в настройках состояние`,noValues:`Выберите в настройках отображаемые состояния`,waiting:`ожидание данных…`,min:`мин`,avg:`сред`,max:`макс`,noPosition:`Нет собственной позиции`,targets:`целей`,seen:`замечен`,distance:`расстояние`,chain:`цепь`,atDrop:`при отдаче`,depth:`глубина`,alarm:`Тревога`,armed:`включена`,off:`выкл`,radius:`Радиус`,dropHere:`Якорь здесь`,map:`Карта`,satellite:`Спутник`,noAnchor:`Нет позиции якоря`,zoomIn:`Приблизить`,zoomOut:`Отдалить`,northUp:`Север вверху`,courseUp:`Курс вверху`,mode:`Режим`,lock:`Задан`,modeStandby:`Ожидание`,modeAuto:`Авто`,modeWind:`Ветер`,modeTrack:`Трек`,modeNoDrift:`Без дрейфа`,confirmTitle:`Подтвердите большое изменение`,lockedHeading:`Заданный курс`,now:`сейчас`,new:`новый`,autoCancel:`Автоматическая отмена через`,cancel:`Отмена`,confirm:`Подтвердить`,port:`ЛБ`,starboard:`ПБ`},pt:{chooseInstance:`Escolha uma instância do adaptador NMEA nas definições`,chooseState:`Escolha um estado nas definições`,noValues:`Escolha os estados a mostrar nas definições`,waiting:`aguardando dados…`,min:`mín`,avg:`méd`,max:`máx`,noPosition:`Sem posição própria`,targets:`alvos`,seen:`visto`,distance:`distância`,chain:`corrente`,atDrop:`ao fundear`,depth:`profundidade`,alarm:`Alarme`,armed:`ativo`,off:`desligado`,radius:`Raio`,dropHere:`Âncora aqui`,map:`Mapa`,satellite:`Satélite`,noAnchor:`Sem posição da âncora`,zoomIn:`Aproximar`,zoomOut:`Afastar`,northUp:`Norte para cima`,courseUp:`Rumo para cima`,mode:`Modo`,lock:`Fixo`,modeStandby:`Espera`,modeAuto:`Auto`,modeWind:`Vento`,modeTrack:`Rota`,modeNoDrift:`Sem deriva`,confirmTitle:`Confirmar grande alteração`,lockedHeading:`Rumo fixado`,now:`agora`,new:`novo`,autoCancel:`Cancelamento automático em`,cancel:`Cancelar`,confirm:`Confirmar`,port:`BB`,starboard:`EB`},nl:{chooseInstance:`Kies in de instellingen een instantie van de NMEA-adapter`,chooseState:`Kies in de instellingen een status`,noValues:`Kies in de instellingen de te tonen statussen`,waiting:`wachten op gegevens…`,min:`min`,avg:`gem`,max:`max`,noPosition:`Geen eigen positie`,targets:`doelen`,seen:`gezien`,distance:`afstand`,chain:`ketting`,atDrop:`bij ankeren`,depth:`diepte`,alarm:`Alarm`,armed:`actief`,off:`uit`,radius:`Straal`,dropHere:`Anker hier`,map:`Kaart`,satellite:`Satelliet`,noAnchor:`Geen ankerpositie`,zoomIn:`Inzoomen`,zoomOut:`Uitzoomen`,northUp:`Noord boven`,courseUp:`Koers boven`,mode:`Modus`,lock:`Vast`,modeStandby:`Stand-by`,modeAuto:`Auto`,modeWind:`Wind`,modeTrack:`Track`,modeNoDrift:`Geen drift`,confirmTitle:`Grote wijziging bevestigen`,lockedHeading:`Vastgezette koers`,now:`nu`,new:`nieuw`,autoCancel:`Automatisch geannuleerd over`,cancel:`Annuleren`,confirm:`Bevestigen`,port:`BB`,starboard:`SB`},fr:{chooseInstance:`Choisissez une instance de l'adaptateur NMEA dans les paramètres`,chooseState:`Choisissez un état dans les paramètres`,noValues:`Choisissez les états à afficher dans les paramètres`,waiting:`en attente de données…`,min:`min`,avg:`moy`,max:`max`,noPosition:`Pas de position propre`,targets:`cibles`,seen:`vu`,distance:`distance`,chain:`chaîne`,atDrop:`au mouillage`,depth:`profondeur`,alarm:`Alarme`,armed:`armée`,off:`arrêt`,radius:`Rayon`,dropHere:`Ancre ici`,map:`Carte`,satellite:`Satellite`,noAnchor:`Pas de position d'ancre`,zoomIn:`Zoom avant`,zoomOut:`Zoom arrière`,northUp:`Nord en haut`,courseUp:`Cap en haut`,mode:`Mode`,lock:`Consigne`,modeStandby:`Veille`,modeAuto:`Auto`,modeWind:`Vent`,modeTrack:`Route`,modeNoDrift:`Sans dérive`,confirmTitle:`Confirmer un grand changement`,lockedHeading:`Cap verrouillé`,now:`actuel`,new:`nouveau`,autoCancel:`Annulation automatique dans`,cancel:`Annuler`,confirm:`Confirmer`,port:`BÂB`,starboard:`TRIB`},it:{chooseInstance:`Scegli un'istanza dell'adattatore NMEA nelle impostazioni`,chooseState:`Scegli uno stato nelle impostazioni`,noValues:`Scegli gli stati da mostrare nelle impostazioni`,waiting:`in attesa di dati…`,min:`min`,avg:`media`,max:`max`,noPosition:`Nessuna posizione propria`,targets:`bersagli`,seen:`visto`,distance:`distanza`,chain:`catena`,atDrop:`all'ancoraggio`,depth:`profondità`,alarm:`Allarme`,armed:`attivo`,off:`spento`,radius:`Raggio`,dropHere:`Ancora qui`,map:`Mappa`,satellite:`Satellite`,noAnchor:`Nessuna posizione dell'ancora`,zoomIn:`Ingrandisci`,zoomOut:`Riduci`,northUp:`Nord in alto`,courseUp:`Rotta in alto`,mode:`Modalità`,lock:`Impostata`,modeStandby:`Standby`,modeAuto:`Auto`,modeWind:`Vento`,modeTrack:`Rotta`,modeNoDrift:`Senza deriva`,confirmTitle:`Conferma grande modifica`,lockedHeading:`Rotta bloccata`,now:`ora`,new:`nuovo`,autoCancel:`Annullamento automatico tra`,cancel:`Annulla`,confirm:`Conferma`,port:`SX`,starboard:`DX`},es:{chooseInstance:`Elija una instancia del adaptador NMEA en la configuración`,chooseState:`Elija un estado en la configuración`,noValues:`Elija los estados a mostrar en la configuración`,waiting:`esperando datos…`,min:`mín`,avg:`med`,max:`máx`,noPosition:`Sin posición propia`,targets:`objetivos`,seen:`visto`,distance:`distancia`,chain:`cadena`,atDrop:`al fondear`,depth:`profundidad`,alarm:`Alarma`,armed:`activa`,off:`apagada`,radius:`Radio`,dropHere:`Ancla aquí`,map:`Mapa`,satellite:`Satélite`,noAnchor:`Sin posición del ancla`,zoomIn:`Acercar`,zoomOut:`Alejar`,northUp:`Norte arriba`,courseUp:`Rumbo arriba`,mode:`Modo`,lock:`Fijado`,modeStandby:`En espera`,modeAuto:`Auto`,modeWind:`Viento`,modeTrack:`Ruta`,modeNoDrift:`Sin deriva`,confirmTitle:`Confirmar cambio grande`,lockedHeading:`Rumbo fijado`,now:`ahora`,new:`nuevo`,autoCancel:`Cancelación automática en`,cancel:`Cancelar`,confirm:`Confirmar`,port:`BB`,starboard:`EB`},pl:{chooseInstance:`Wybierz w ustawieniach instancję adaptera NMEA`,chooseState:`Wybierz w ustawieniach stan`,noValues:`Wybierz w ustawieniach stany do wyświetlenia`,waiting:`oczekiwanie na dane…`,min:`min`,avg:`śr`,max:`maks`,noPosition:`Brak własnej pozycji`,targets:`celów`,seen:`widziany`,distance:`odległość`,chain:`łańcuch`,atDrop:`przy kotwiczeniu`,depth:`głębokość`,alarm:`Alarm`,armed:`uzbrojony`,off:`wył.`,radius:`Promień`,dropHere:`Kotwica tutaj`,map:`Mapa`,satellite:`Satelita`,noAnchor:`Brak pozycji kotwicy`,zoomIn:`Powiększ`,zoomOut:`Pomniejsz`,northUp:`Północ u góry`,courseUp:`Kurs u góry`,mode:`Tryb`,lock:`Zadany`,modeStandby:`Czuwanie`,modeAuto:`Auto`,modeWind:`Wiatr`,modeTrack:`Trasa`,modeNoDrift:`Bez dryfu`,confirmTitle:`Potwierdź dużą zmianę`,lockedHeading:`Zablokowany kurs`,now:`teraz`,new:`nowy`,autoCancel:`Automatyczne anulowanie za`,cancel:`Anuluj`,confirm:`Potwierdź`,port:`LB`,starboard:`PB`},uk:{chooseInstance:`Виберіть у налаштуваннях екземпляр адаптера NMEA`,chooseState:`Виберіть у налаштуваннях стан`,noValues:`Виберіть у налаштуваннях стани для відображення`,waiting:`очікування даних…`,min:`мін`,avg:`сер`,max:`макс`,noPosition:`Немає власної позиції`,targets:`цілей`,seen:`помічено`,distance:`відстань`,chain:`ланцюг`,atDrop:`при віддачі`,depth:`глибина`,alarm:`Тривога`,armed:`увімкнено`,off:`вимк`,radius:`Радіус`,dropHere:`Якір тут`,map:`Карта`,satellite:`Супутник`,noAnchor:`Немає позиції якоря`,zoomIn:`Наблизити`,zoomOut:`Віддалити`,northUp:`Північ угорі`,courseUp:`Курс угорі`,mode:`Режим`,lock:`Задано`,modeStandby:`Очікування`,modeAuto:`Авто`,modeWind:`Вітер`,modeTrack:`Трек`,modeNoDrift:`Без дрейфу`,confirmTitle:`Підтвердьте велику зміну`,lockedHeading:`Заданий курс`,now:`зараз`,new:`новий`,autoCancel:`Автоматичне скасування через`,cancel:`Скасувати`,confirm:`Підтвердити`,port:`ЛБ`,starboard:`ПБ`},"zh-cn":{chooseInstance:`请在设置中选择一个 NMEA 适配器实例`,chooseState:`请在设置中选择一个状态`,noValues:`请在设置中选择要显示的状态`,waiting:`等待数据…`,min:`最小`,avg:`平均`,max:`最大`,noPosition:`没有本船位置`,targets:`个目标`,seen:`最后出现`,distance:`距离`,chain:`锚链`,atDrop:`抛锚时`,depth:`水深`,alarm:`警报`,armed:`已启用`,off:`关闭`,radius:`半径`,dropHere:`在此抛锚`,map:`地图`,satellite:`卫星`,noAnchor:`没有锚位`,zoomIn:`放大`,zoomOut:`缩小`,northUp:`北向上`,courseUp:`航向向上`,mode:`模式`,lock:`锁定`,modeStandby:`待机`,modeAuto:`自动`,modeWind:`风向`,modeTrack:`航迹`,modeNoDrift:`无漂移`,confirmTitle:`确认大幅更改`,lockedHeading:`锁定航向`,now:`当前`,new:`新`,autoCancel:`自动取消倒计时`,cancel:`取消`,confirm:`确认`,port:`左舷`,starboard:`右舷`}};function U(e,t){return(H[e]||V)[t]||V[t]}var W=`
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
`,G=`system.config`,K=class extends D{#e;#t;#n=/* @__PURE__ */ new Set;#r=null;#i=null;#a=0;tickMs=0;throttleMs=0;constructor(e){super();let t=this.attachShadow({mode:`open`}),n=document.createElement(`style`);n.textContent=W+e,this.#t=document.createElement(`div`),this.#t.className=`mount`,t.append(n,this.#t),this.#e=r(this.#t)}connectedCallback(){super.connectedCallback(),this.tickMs&&!this.#r&&(this.#r=setInterval(()=>{!document.hidden&&this.isConnected&&this.render()},this.tickMs))}disconnectedCallback(){super.disconnectedCallback(),this.#r&&=(clearInterval(this.#r),null),this.#i&&=(clearTimeout(this.#i),null)}getObjectIds(e){return[G]}get isFloatComma(){return!!this.objects[G]?.common?.isFloatComma}get defaultHistory(){return this.objects[`system.config`]?.common?.defaultHistory||``}word(e){return U(this.systemLang,e)}num(e){if(!e)return null;let t=this.states[e]?.val;if(t==null||t===``)return null;let n=typeof t==`string`?parseFloat(t.replace(`,`,`.`)):Number(t);return Number.isFinite(n)?n:null}render(){if(this.throttleMs){let e=this.#a+this.throttleMs-Date.now();if(e>0){this.#i||=setTimeout(()=>{this.#i=null,this.isConnected&&this.render()},e);return}}this.#a=Date.now(),this.#t.classList.toggle(`light`,this.theme.type===`light`),this.#e.render(this.renderContent());for(let e of this.#n)e()}async showElementDialog(e){if(this.editMode)return null;let t=document.createElement(`div`);t.style.width=`100%`,t.style.height=`100%`;let n=t.attachShadow({mode:`open`}),a=document.createElement(`style`);a.textContent=W+e.css;let o=document.createElement(`div`);o.className=e.fit?`mount dialog fit`:`mount dialog`,n.append(a,o);let s=r(o),c=(e=null)=>{t.dispatchEvent(new CustomEvent(i,{detail:e,bubbles:!0,composed:!0}))},l=()=>{for(let[e,n]of Object.entries(x(this.theme)))t.style.setProperty(e,n);o.classList.toggle(`light`,this.theme.type===`light`),s.render(e.draw(c))};this.#n.add(l),l();try{return await this.openDialog({title:e.title,element:t,width:e.width,height:e.height})}finally{this.#n.delete(l),s.unmount()}}},q=72e5,J=1e3,Y=J/2,oe=190,se=.15,X={anchor:`#ff5252`,boat:`#3a8dff`,chain:`#ffeb3b`,swing:`#ffeb3b`,trail:`#ff1744`,alarm:`#00e676`,tripped:`#ff1744`},ce=`M12,2A3,3 0 0,0 9,5C9,6.27 9.8,7.4 11,7.83V10H8V12H11V18.92C9.16,18.65 7.53,17.73 6.34,16.34L8,15L4,13V16.5L5.5,15.5C7,17.55 9.38,19 12,19C14.62,19 17,17.55 18.5,15.5L20,16.5V13L16,15L17.66,16.34C16.47,17.73 14.84,18.65 13,18.92V12H16V10H13V7.83C14.2,7.4 15,6.27 15,5A3,3 0 0,0 12,2M12,4A1,1 0 0,1 13,5A1,1 0 0,1 12,6A1,1 0 0,1 11,5A1,1 0 0,1 12,4Z`,Z=`M11 3 4 15h7V3zm2 1v11h7L13 4zM3 17l1.5 3h15l1.5-3H3z`,Q=`
.anchorage {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
}
.map {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--iob-border-radius, 4px);
}
.map svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background: #aac3d4;
}
.readouts {
    position: absolute;
    top: 6px;
    left: 6px;
    right: 6px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    pointer-events: none;
}
.box {
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    padding: 2px 8px;
}
.box .label { font-size: 11px; font-weight: 600; opacity: 0.75; }
.box .value { font-size: clamp(16px, 9cqmin, 26px); font-weight: 800; line-height: 1.05; }
.box.far { color: #ff5252; }
.box.tripped { background: rgba(198, 40, 40, 0.85); }
.details {
    display: flex;
    gap: 12px;
    font-size: 12px;
}
.message {
    position: absolute;
    left: 50%;
    bottom: 10%;
    transform: translateX(-50%);
    white-space: nowrap;
}
.attribution {
    position: absolute;
    right: 4px;
    bottom: 2px;
    font-size: 10px;
    color: #333;
    background: rgba(255, 255, 255, 0.6);
    padding: 0 3px;
    pointer-events: none;
}
.controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px;
}
.controls label {
    display: flex;
    align-items: center;
    gap: 6px;
}
.controls input[type='number'] {
    width: 80px;
    font: inherit;
    padding: 6px;
    border-radius: var(--iob-border-radius, 4px);
    border: 1px solid var(--iob-divider);
    background: transparent;
    color: inherit;
}
.controls input[type='checkbox'] {
    width: 20px;
    height: 20px;
    accent-color: ${X.alarm};
}
.controls .alarm {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border: 1px solid var(--iob-divider);
    border-radius: var(--iob-border-radius, 4px);
}
.controls .alarm.armed {
    border-color: ${X.alarm};
}
.selected {
    background: var(--iob-primary) !important;
    border-color: var(--iob-primary) !important;
    color: var(--iob-primary-contrast, #fff) !important;
}
@container (max-height: 200px) {
    .details { display: none; }
}
`;function le(e){if(typeof e!=`string`)return null;let t=e.split(/[;,]/).map(e=>parseFloat(e.trim()));return t.length<2||!Number.isFinite(t[0])||!Number.isFinite(t[1])?null:{lat:t[0],lon:t[1]}}function ue(e,t){return t===null||t<=0||t>=e?e:Math.sqrt(e*e-t*t)}function $(e){let t=e.instance;if(!t)return null;let n=!e.anchorPosition&&!!e.anchorLat&&!!e.anchorLon;return{anchorPosition:n?``:e.anchorPosition||`${t}.anchorAlarm.anchorPosition`,anchorLat:n&&e.anchorLat||``,anchorLon:n&&e.anchorLon||``,boatLat:e.positionLat||`${t}.gnssPositionData.latitude`,boatLon:e.positionLon||`${t}.gnssPositionData.longitude`,chainLength:e.chainLength||``,depthAtDrop:e.depthAtDrop||``,depth:`${t}.waterDepth.depth`,alarmRadius:`${t}.anchorAlarm.alarmRadius`,isAlarm:`${t}.anchorAlarm.isAlarm`,isActive:`${t}.anchorAlarm.isActive`}}var de=class extends K{#e=[];#t=``;#n=``;#r=null;#i=0;constructor(){super(Q)}getStateIds(e){let t=$(e);return t?Object.values(t).filter(Boolean):[]}#a(e){if(e.anchorPosition)return le(this.states[e.anchorPosition]?.val);let t=this.num(e.anchorLat),n=this.num(e.anchorLon);return t!==null&&n!==null?{lat:t,lon:n}:null}#o(e){let t=this.num(e.boatLat),n=this.num(e.boatLon);return t!==null&&n!==null&&(t||n)?{lat:t,lon:n}:null}#s(e){let t=`${e.boatLat}|${e.boatLon}`;this.#t!==t&&(this.#t=t,this.#e=[]);let n=this.#o(e),r=Date.now(),i=this.#e.filter(e=>e.ts>=r-q),a=i[i.length-1];if(n&&(!a||a.lat!==n.lat||a.lon!==n.lon)){let t=Math.max(this.states[e.boatLat]?.ts||0,this.states[e.boatLon]?.ts||0)||r;i=[...i,{...n,ts:t}]}this.#e=i}async#c(e){let t=this.socket,n=this.defaultHistory,r=this.objects[e.boatLat],i=this.objects[e.boatLon];if(!t||!n||!r?.common?.custom?.[n]||!i?.common?.custom?.[n])return;let a=this.#t;try{if(!(await t.getState(`system.adapter.${n}.alive`))?.val)return;let r=Date.now(),i=r-q,[o,s]=await Promise.all([t.getHistory(e.boatLat,{instance:n,start:i,end:r,aggregate:`none`}),t.getHistory(e.boatLon,{instance:n,start:i,end:r,aggregate:`none`})]);if(a!==this.#t||!Array.isArray(o)||!Array.isArray(s))return;let c=/* @__PURE__ */ new Map;for(let e of o){let t=Number(e.val);Number.isFinite(t)&&e.ts&&c.set(Math.floor(e.ts/1e3),t)}let l=new Set(this.#e.map(e=>e.ts)),u=[];for(let e of s){let t=Number(e.val),n=e.ts?c.get(Math.floor(e.ts/1e3)):void 0;Number.isFinite(t)&&n!==void 0&&e.ts&&!l.has(e.ts)&&u.push({lat:n,lon:t,ts:e.ts})}this.#e=[...u,...this.#e].sort((e,t)=>e.ts-t.ts),this.isConnected&&this.render()}catch{}}#l(e){let t=this.#o(e);t&&(e.anchorPosition?this.setState(e.anchorPosition,`${t.lat};${t.lon}`):(this.setState(e.anchorLat,t.lat),this.setState(e.anchorLon,t.lon)))}#u(e,t){let n=Number(t.replace(`,`,`.`));t.trim()&&Number.isFinite(n)&&n>=1&&Math.round(n)!==this.num(e.alarmRadius)&&this.setState(e.alarmRadius,Math.round(n))}#d=()=>{let e=$(this.settings);!this.editMode&&e&&this.showElementDialog({title:this.text(B[`anchor-position`]),css:Q,width:900,height:760,draw:()=>{let r=this.#r||this.settings.mapStyle||`osm`,i=this.num(e.alarmRadius),a=this.states[e.isActive]?.val===!0;return/* @__PURE__ */ n(`div`,{className:`anchorage`,children:[this.#f(e,!0),/* @__PURE__ */ n(`div`,{className:`controls`,children:[/* @__PURE__ */ n(`span`,{children:[/* @__PURE__ */ t(`button`,{type:`button`,className:`btn${r===`osm`?` selected`:``}`,onClick:()=>{this.#r=`osm`,this.render()},children:this.word(`map`)}),/* @__PURE__ */ t(`button`,{type:`button`,className:`btn${r===`satellite`?` selected`:``}`,onClick:()=>{this.#r=`satellite`,this.render()},children:this.word(`satellite`)})]}),/* @__PURE__ */ n(`span`,{children:[/* @__PURE__ */ t(`button`,{type:`button`,className:`btn`,title:this.word(`zoomOut`),onClick:()=>{this.#i=Math.max(-6,this.#i-1),this.render()},children:`−`}),/* @__PURE__ */ t(`button`,{type:`button`,className:`btn`,title:this.word(`zoomIn`),onClick:()=>{this.#i=Math.min(6,this.#i+1),this.render()},children:`+`})]}),/* @__PURE__ */ n(`button`,{type:`button`,className:`btn`,disabled:!this.#o(e),onClick:()=>this.#l(e),children:[`⚓ `,this.word(`dropHere`)]}),/* @__PURE__ */ n(`span`,{className:`alarm${a?` armed`:``}`,children:[/* @__PURE__ */ t(`b`,{children:this.word(`alarm`)}),/* @__PURE__ */ n(`label`,{children:[this.word(`radius`),/* @__PURE__ */ t(`input`,{type:`number`,min:1,step:1,defaultValue:i===null?``:String(i),onBlur:t=>this.#u(e,t.currentTarget.value),onKeyDown:e=>{e.key===`Enter`&&e.currentTarget.blur()}},String(i)),`m`]}),/* @__PURE__ */ n(`label`,{children:[/* @__PURE__ */ t(`input`,{type:`checkbox`,checked:a,onChange:t=>void this.setState(e.isActive,t.currentTarget.checked)}),a?this.word(`armed`):this.word(`off`)]})]})]})]})}}).finally(()=>{this.#r=null,this.#i=0,this.isConnected&&this.render()})};#f(r,i){let a=this.#a(r),o=this.#o(r),s=this.isFloatComma,c=this.num(r.chainLength),l=this.num(r.depthAtDrop),u=this.num(r.depth),d=this.num(r.alarmRadius),f=this.states[r.isActive]?.val===!0,p=this.states[r.isAlarm]?.val===!0,m=c!==null&&c>0?ue(c,l):null,h=a&&o?ae(a.lat,a.lon,o.lat,o.lon):null,g=(i&&this.#r||this.settings.mapStyle||`osm`)===`satellite`?R.satellite:R.voyager,_=a&&o?{lat:(a.lat+o.lat)/2,lon:(a.lon+o.lon)/2}:a||o,v=null;if(_){let r=e=>ie(e.lat,e.lon,_.lat,_.lon),s=25;if(a){let e=r(a),t=Math.max(m||0,f&&d?d:0,10);s=Math.max(s,Math.hypot(e.east,e.north)+t)}if(o){let e=r(o);s=Math.max(s,Math.hypot(e.east,e.north)+10)}let c=Math.max(se,s/oe)/(i?2**this.#i:1),l=e=>{let t=r(e);return{x:Y+t.east/c,y:Y-t.north/c}},u=a?l(a):null,h=o?l(o):null,y=Date.now();v=/* @__PURE__ */ n(e,{children:[/* @__PURE__ */ t(z,{source:g,lat:_.lat,lon:_.lon,cx:Y,cy:Y,metersPerUnit:c,x0:0,y0:0,x1:J,y1:J,tileUnits:300}),/* @__PURE__ */ t(`g`,{children:this.#e.map((e,n)=>{let{x:r,y:i}=l(e),a=1-Math.min(1,Math.max(0,y-e.ts)/q);return/* @__PURE__ */ t(`circle`,{cx:r,cy:i,r:6,fill:X.trail,fillOpacity:.25+.55*a},`${e.ts}-${n}`)})}),u&&m?/* @__PURE__ */ t(`circle`,{cx:u.x,cy:u.y,r:m/c,fill:X.swing,fillOpacity:.05,stroke:X.swing,strokeOpacity:.8,strokeWidth:4}):null,u&&f&&d?/* @__PURE__ */ t(`circle`,{cx:u.x,cy:u.y,r:d/c,fill:p?X.tripped:X.alarm,fillOpacity:.08,stroke:p?X.tripped:X.alarm,strokeWidth:6,strokeDasharray:`16 12`}):null,u&&h?/* @__PURE__ */ t(`line`,{x1:u.x,y1:u.y,x2:h.x,y2:h.y,stroke:X.chain,strokeWidth:4,strokeDasharray:`12 12`,strokeOpacity:.9}):null,u?/* @__PURE__ */ t(`path`,{d:ce,transform:`translate(${u.x-36} ${u.y-36}) scale(3)`,fill:X.anchor,stroke:`#000`,strokeWidth:.6}):null,h?/* @__PURE__ */ t(`path`,{d:Z,transform:`translate(${h.x-36} ${h.y-36}) scale(3)`,fill:X.boat,stroke:`#000`,strokeWidth:.6}):null]})}let y=[];c!==null&&y.push(`${this.word(`chain`)} ${Math.round(c)} m`),l!==null&&y.push(`${this.word(`atDrop`)} ${P(l,1,s)} m`),u!==null&&y.push(`${this.word(`depth`)} ${P(u,1,s)} m`);let b=``;return o?a||(b=this.word(`noAnchor`)):b=this.word(`noPosition`),/* @__PURE__ */ n(`div`,{className:`map`,children:[/* @__PURE__ */ t(`svg`,{viewBox:`0 0 ${J} ${J}`,preserveAspectRatio:`xMidYMid slice`,children:v}),/* @__PURE__ */ n(`div`,{className:`readouts`,children:[/* @__PURE__ */ n(`div`,{className:`box${m!==null&&h!==null&&h>m?` far`:``}${p?` tripped`:``}`,children:[/* @__PURE__ */ t(`div`,{className:`label`,children:p?this.word(`alarm`):this.word(`distance`)}),/* @__PURE__ */ t(`div`,{className:`value`,children:h===null?`—`:`${Math.round(h)} m`})]}),y.length?/* @__PURE__ */ t(`div`,{className:`box details`,children:y.map(e=>/* @__PURE__ */ t(`span`,{children:e},e))}):null]}),b?/* @__PURE__ */ t(`div`,{className:`box message`,children:b}):null,_?/* @__PURE__ */ t(`div`,{className:`attribution`,children:g.attribution}):null]})}renderContent(){let e=$(this.settings);return e?(this.#s(e),this.#n!==this.#t&&this.socket&&this.objects[e.boatLat]!==void 0&&this.objects[e.boatLon]!==void 0&&this.objects[`system.config`]!==void 0&&(this.#n=this.#t,this.#c(e)),/* @__PURE__ */ t(`div`,{className:`fill${this.editMode?` edit`:` clickable`}`,role:`button`,tabIndex:this.editMode?void 0:0,onClick:this.#d,onKeyDown:e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),this.#d())},children:/* @__PURE__ */ t(`div`,{className:`anchorage`,children:this.#f(e,!1)})})):/* @__PURE__ */ t(j,{text:this.word(`chooseInstance`),editMode:this.editMode})}};O(k(`anchor-position`),de);