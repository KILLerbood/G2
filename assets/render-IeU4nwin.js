import{bc as F}from"./index-TsvviHDK.js";const r=t=>Math.round((Number(t)||0)*100)/100;function A(t){let s=0,n=0;t.items.forEach($=>{const c=r($.qty*$.unit);s+=c,n+=r(c*Math.min(100,Math.max(0,$.discountPct||0))/100)}),s=r(s),n=r(n);const o=r(s-n),i=t.discount,u=i?r(Math.min(o,i.pct?o*Math.min(100,Math.max(0,i.pct))/100:Math.max(0,i.amount||0))):0,w=r(o-u),f=r(w*Math.max(0,t.taxPct||0)/100),m=r(w+f),d=n+u;return{gross:s,lineDiscounts:n,subtotal:o,discount:u,afterDiscount:w,tax:f,total:m,savedPct:s?Math.round(d/s*1e3)/10:0}}const e=t=>String(t??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[s]),l=t=>r(t).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),x=t=>(Math.round(t*10)/10).toString().replace(/\.0$/,"")+"%",D={quote:["عرض سعر","QUOTATION"],invoice:["فاتورة","INVOICE"]};function L(t,s=""){const n=A(t),o=e(t.currency),i=t.kind==="quote",u=n.lineDiscounts>0||n.discount>0,w=i?[["رقم العرض","Quote No.",t.number],["تاريخ العرض","Date",t.issueDate],["صالح حتى","Valid Until",t.dueDate],["فترة الخدمة","Service Period",t.period||"—"]]:[["رقم الفاتورة","Invoice No.",t.number],["تاريخ الإصدار","Issue Date",t.issueDate],["تاريخ الاستحقاق","Due Date",t.dueDate],["فترة الخدمة","Service Period",t.period||"—"]],f=t.items.map((a,g)=>{const v=r(a.qty*a.unit),y=Math.min(100,Math.max(0,a.discountPct||0)),S=r(v-v*y/100),R=y?`<s>${l(a.unit)}</s><br>${l(r(a.unit*(1-y/100)))}`:l(a.unit),E=y?`<s>${l(v)}</s><br><b>${l(S)}</b><span class="chip num">-${x(y)}</span>`:`<b>${l(v)}</b>`;return`<tr>
      <td class="n">${String(g+1).padStart(2,"0")}</td>
      <td class="svc"><div class="svc-t">${e(a.title)}${a.titleEn?` <span class="en">· ${e(a.titleEn)}</span>`:""}</div>${a.desc?`<div class="svc-d">${e(a.desc)}</div>`:""}</td>
      <td class="c">${e(a.qty)}</td><td class="c num">${R}</td><td class="c num">${E}</td></tr>`}).join(""),m=[];if(u&&m.push(h("السعر الأساسي","Original Price",`<s>${l(n.gross)}</s>`)),n.lineDiscounts&&m.push(h("خصومات الخدمات","Service Discounts","-"+l(n.lineDiscounts),"neg")),m.push(h("المجموع الفرعي","Subtotal",l(n.subtotal))),n.discount&&t.discount){const a=e(t.discount.name||"خصم")+(t.discount.pct?` <span class="num">(${x(t.discount.pct)})</span>`:"");m.push(h(a,"Discount","-"+l(n.discount),"neg"))}t.taxPct&&m.push(h(`الضريبة (${x(t.taxPct)})`,"Tax",l(n.tax)));const d=!i&&t.plan?t.plan.filter(a=>a.current)[0]:void 0,$=t.dueAmount!=null&&!i?r(t.dueAmount):d?r(d.amount??n.total*d.pct/100):n.total,c=i?[]:t.payments||[],z=r(c.reduce((a,g)=>a+(Number(g.amount)||0),0)),I=r(Math.max(0,$-z)),j=c.length?I<=0?"paid":"partial":"open";d&&!(t.payments&&t.payments.length)&&m.push(h("إجمالي العقد","Contract Total",l(n.total)));const P=t.plan&&t.plan.length?`
    <div class="plan">
      <div class="lbl">${i?"خطة الدفع":"الدفعات"} · <span class="en">${i?"PAYMENT PLAN":"PAYMENTS"}</span></div>
      <table>${t.plan.map((a,g)=>`<tr${a.current?' class="cur"':""}><td class="n">${g+1}</td><td><b>${e(a.label)}</b> <span class="num pp">${x(a.pct)}</span> <span class="svc-d">· ${e(a.when)}</span></td><td class="amt num"><b>${o} ${l(a.amount??n.total*a.pct/100)}</b></td></tr>`).join("")}</table>
    </div>`:"",p=t.payment,U=u&&i?`<div class="saved">وفّرت <span class="num">${o} ${l(n.gross-n.afterDiscount)}</span> · خصم <span class="num">${x(n.savedPct)}</span></div>`:"";return`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${e(D[t.kind][0])} ${e(t.number)}</title>
<style>${s}${M}</style></head><body><div class="page">
<header class="top">
  <div class="brand"><img src="${e(t.logoUrl)}" alt="">
    <div><div class="bn">Magmafy <span>OGP</span></div><div class="bt">شريك النمو أونلاين لقطاع الأثاث والديكور</div><div class="be">Online Growth Partner · Furniture &amp; Interiors</div></div></div>
  <div class="kind"><div class="ka">${D[t.kind][0]}</div><div class="ke">${D[t.kind][1]}</div>${j==="paid"?'<div class="badge ok">مدفوعة · PAID</div>':j==="partial"?'<div class="badge part">مدفوعة جزئيًا · PARTIALLY PAID</div>':""}</div>
</header>
<div class="bar"></div>
<section class="meta">${w.map(([a,g,v])=>`<div class="box"><div class="lbl2">${a} · <span class="en">${g}</span></div><div class="v">${e(v)}</div></div>`).join("")}</section>
<section class="parties">
  <div><div class="lbl">من · <span class="en">FROM</span></div><div class="pn">${e(t.from.name)}</div>
    ${[t.from.line,t.from.email,t.from.whatsapp?"واتساب: "+t.from.whatsapp:"",t.from.website].filter(Boolean).map(a=>`<div class="pl">${e(a)}</div>`).join("")}</div>
  <div><div class="lbl">${i?"مقدّم إلى":"فاتورة إلى"} · <span class="en">${i?"PREPARED FOR":"BILL TO"}</span></div><div class="pn">${e(t.client.business)}</div>
    ${[t.client.contact,t.client.city,[t.client.email,t.client.phone].filter(Boolean).join(" · "),t.client.taxId?"الرقم الضريبي: "+t.client.taxId:""].filter(Boolean).map(a=>`<div class="pl">${e(a)}</div>`).join("")}</div>
</section>
<table class="items"><thead><tr><th class="n">#</th><th>الخدمة · <span class="en">Service</span></th><th class="c">الكمية · <span class="en">Qty</span></th><th class="c">سعر الوحدة · <span class="en">Unit</span></th><th class="c">الإجمالي · <span class="en">Amount</span></th></tr></thead><tbody>${f}</tbody></table>
<section class="bottom">
  <div class="side">${j==="paid"?"":`<div class="paycard"><div class="lbl">بيانات الدفع · <span class="en">PAYMENT DETAILS</span></div>
    ${p.method?`<div class="pl">طريقة الدفع: ${e(p.method)}</div>`:""}${p.beneficiary?`<div class="pl">اسم المستفيد: ${e(p.beneficiary)}</div>`:""}
    ${p.iban?`<div class="pl ltr">IBAN: ${e(p.iban)}</div>`:""}${p.swift?`<div class="pl ltr">SWIFT / Routing: ${e(p.swift)}</div>`:""}
    ${p.method||p.iban||p.beneficiary?`<div class="pl">مرجع التحويل: اكتب رقم ${i?"العرض":"الفاتورة"} في وصف التحويل</div>`:'<div class="pl">هنرسل لك بيانات التحويل مع الفاتورة.</div>'}</div>`}${P}${c.length?`
    <div class="pays"><div class="lbl">سجل المدفوعات · <span class="en">PAYMENTS RECEIVED</span></div>
      <table>${c.map(a=>`<tr><td><b class="num">${e(a.date)}</b> <span class="svc-d">${[a.ref?'<span class="num">'+e(a.ref)+"</span>":"",a.from?e(a.from)+(a.account?' <span class="num">'+e(a.account)+"</span>":""):""].filter(Boolean).join(" · ")}</span></td><td class="amt num"><b>${o} ${l(a.amount)}</b></td></tr>`).join("")}</table></div>`:""}</div>
  <div class="totals">${m.join("")}
    ${c.length?h(d?"مستحق في هذه الفاتورة":"الإجمالي",d?"This Invoice":"Total",l($))+h("المدفوع","Paid","-"+l(z),"neg"):""}
    <div class="due${j==="paid"?" ok":""}"><span>${i?"الإجمالي بعد الخصم":c.length?"المتبقي":"الإجمالي المستحق"} · <span class="en">${i?"Total":c.length?"Balance Due":"Total Due"}</span></span><b>${o} ${l(c.length?I:$)}</b></div>${d&&!c.length?`<div class="saved" style="color:#5d5768">${e(d.label)} · <span class="num">${x(d.pct)}</span> من إجمالي العقد</div>`:""}${U}</div>
</section>
${t.note?`<div class="note">${e(t.note)}</div>`:""}
<section class="terms"><div class="lbl">الشروط · <span class="en">TERMS</span></div>
  <div class="tc"><ol>${t.terms.map(a=>`<li>${e(a[0])}</li>`).join("")}</ol><ol class="ltr">${t.terms.map(a=>`<li>${e(a[1])}</li>`).join("")}</ol></div></section>
<footer><b>شكرًا لثقتكم · <span class="en">Thank you for your Trust</span></b><span>نحوّل متابعيك إلى زوّار لمعرضك</span></footer>
</div></body></html>`;function h(a,g,v,y=""){return`<div class="tr ${y}"><span>${a} · <span class="en">${g}</span></span><span class="num">${v}</span></div>`}}const M=`
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; }
body { font-family: 'Tajawal', 'Inter', system-ui, sans-serif; color: #17121f; font-size: 10.5pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; min-height: 297mm; padding: 0 0 7mm; position: relative; display: flex; flex-direction: column; }
.en { font-family: 'Inter', 'Tajawal', sans-serif; font-weight: inherit; }
.num, .ltr { direction: ltr; unicode-bidi: isolate; font-family: 'Inter', 'Tajawal', sans-serif; font-variant-numeric: tabular-nums; }
.ltr { text-align: left; }
.top { background: #0e0b12; color: #fff; display: flex; justify-content: space-between; align-items: center; padding: 6mm 11mm 5mm; }
.brand { display: flex; gap: 4mm; align-items: center; }
.brand img { width: 15mm; height: 15mm; border-radius: 4mm; }
.bn { font-family: 'Inter', sans-serif; font-weight: 800; font-size: 20pt; letter-spacing: -.01em; direction: ltr; text-align: right; }
.bn span { font-size: 10pt; color: #ff3d8b; font-weight: 700; }
.bt { font-size: 10pt; opacity: .9; margin-top: .5mm; }
.be { font-family: 'Inter', sans-serif; font-size: 8pt; opacity: .65; direction: ltr; text-align: right; }
.kind { text-align: left; position: relative; }
.ka { font-weight: 800; font-size: 25pt; line-height: 1; }
.ke { font-family: 'Inter', sans-serif; font-size: 8.5pt; letter-spacing: .32em; color: #ffb547; font-weight: 700; margin-top: 2mm; }
.bar { height: 1.4mm; background: linear-gradient(90deg, #7b3cff, #ff2e88 55%, #ff8a3d); }
.badge { position: absolute; left: 100%; bottom: 0; white-space: nowrap; margin-left: 4mm; padding: 1mm 3mm; border-radius: 10mm; font-size: 8.5pt; font-weight: 800; border: 1.5px solid; }
.badge.ok { color: #3fd69a; border-color: #3fd69a; }
.badge.part { color: #ffb547; border-color: #ffb547; }
.due.ok b { color: #3fd69a; }
.pays { margin-top: 3mm; }
.pays table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.pays td { padding: 1mm 1mm; border-bottom: 1px solid #ece8f1; }
.pays .amt { text-align: left; white-space: nowrap; }
.meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 4mm 11mm 4mm; }
.box { border: 1px solid #e3dfe8; border-radius: 3mm; padding: 2mm 3mm; }
.lbl2 { font-size: 7.5pt; color: #807a89; }
.box .v { font-weight: 700; font-size: 10.5pt; margin-top: 1.4mm; }
.lbl { font-weight: 800; font-size: 8pt; color: #d6246f; letter-spacing: .03em; margin-bottom: 2mm; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin: 0 11mm 4mm; }
.pn { font-weight: 800; font-size: 12pt; margin-bottom: 1.5mm; }
.pl { font-size: 9pt; color: #3a3442; line-height: 1.6; }
.items { width: calc(100% - 22mm); margin: 0 11mm; border-collapse: separate; border-spacing: 0; border: 1px solid #e3dfe8; border-radius: 3.5mm; overflow: hidden; }
.items th { background: #f3eff8; font-size: 8pt; color: #5d5768; font-weight: 700; padding: 2.2mm 3mm; text-align: right; }
.items td { padding: 1.6mm 3mm; border-top: 1px solid #ece8f1; vertical-align: middle; }
.items .n { width: 10mm; color: #807a89; text-align: center; }
.items .c { text-align: center; width: 24mm; }
.svc-t { font-weight: 800; font-size: 10.5pt; }
.svc-t .en { font-weight: 700; }
.svc-d { font-size: 8.5pt; color: #807a89; margin-top: .8mm; }
s { color: #a39cab; font-weight: 400; }
.chip { display: inline-block; margin-top: 1mm; background: #ffe6f1; color: #d6246f; font-size: 7.5pt; font-weight: 700; padding: .3mm 1.8mm; border-radius: 10mm; }
.bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin: 4.5mm 11mm 0; align-items: start; }
.paycard { background: #f6f3fa; border-radius: 3.5mm; padding: 3.5mm 4.5mm; }
.tr { display: flex; justify-content: space-between; gap: 3mm; padding: 1.5mm 0; border-bottom: 1px solid #ece8f1; font-size: 9.5pt; }
.tr.neg .num { color: #d6246f; }
.due { margin-top: 3mm; background: #0e0b12; color: #fff; border-radius: 3mm; padding: 3.5mm 4.5mm; display: flex; justify-content: space-between; align-items: center; gap: 4mm; font-weight: 800; }
.due > span { white-space: nowrap; }
.due b { color: #ffb547; font-family: 'Inter', sans-serif; font-size: 13.5pt; direction: ltr; unicode-bidi: isolate; white-space: nowrap; }
.saved { margin-top: 2mm; text-align: center; font-size: 8.5pt; color: #13a36b; font-weight: 700; }
.plan { margin-top: 3.5mm; }
.plan table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.plan .amt { text-align: left; white-space: nowrap; }
.pp { color: #807a89; font-size: 8pt; }
.plan tr.cur td { background: #fff4e6; }
.plan tr.cur td:first-child { border-radius: 0 2mm 2mm 0; } .plan tr.cur td:last-child { border-radius: 2mm 0 0 2mm; }
.plan td { padding: 1.1mm 2mm; border-bottom: 1px solid #ece8f1; }
.plan .n { width: 8mm; color: #807a89; }
.note { margin: 3.5mm 11mm 0; padding: 3mm 4mm; border-inline-start: 1mm solid #ff8a3d; background: #fff7ef; font-size: 9pt; border-radius: 1.5mm; }
.terms { margin: 3.5mm 11mm 0; }
.tc { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; font-size: 7.8pt; color: #3a3442; line-height: 1.5; }
.tc ol { padding-inline-start: 4mm; }
footer { margin: auto 11mm 0; padding-top: 3mm; border-top: 1px solid #e3dfe8; display: flex; justify-content: space-between; font-size: 9pt; color: #5d5768; }
footer b { color: #17121f; }
`,C=""+new URL("tajawal-arabic-400-normal-CyCXRvzh.woff2",import.meta.url).href,N=""+new URL("tajawal-arabic-500-normal-BZ8ojJNu.woff2",import.meta.url).href,B=""+new URL("tajawal-arabic-700-normal-D2-eand5.woff2",import.meta.url).href,O=""+new URL("tajawal-arabic-800-normal-TQp-UTiE.woff2",import.meta.url).href,q=""+new URL("tajawal-latin-400-normal-BVNSOH3d.woff2",import.meta.url).href,Y=""+new URL("tajawal-latin-500-normal-CoYeBiSI.woff2",import.meta.url).href,Q=""+new URL("tajawal-latin-700-normal-BypgxfGb.woff2",import.meta.url).href,V=""+new URL("tajawal-latin-800-normal-CmI34b-g.woff2",import.meta.url).href,G=""+new URL("inter-latin-wght-normal-C2S99t-D.woff2",import.meta.url).href,k=t=>new URL(t,location.href).href,T="unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+200C-200E,U+2010-2011,U+FB50-FDFF,U+FE70-FEFC;",b=(t,s,n,o="")=>`@font-face{font-family:'${t}';font-weight:${s};font-display:block;src:url('${k(n)}') format('woff2');${o}}`;function H(){return[b("Tajawal","400",C,T),b("Tajawal","500",N,T),b("Tajawal","700",B,T),b("Tajawal","800",O,T),b("Tajawal","400",q),b("Tajawal","500",Y),b("Tajawal","700",Q),b("Tajawal","800",V),b("Inter","100 900",G)].join("")}const W=()=>k(F.basePath+"icon-512.png");function X(t){return L({...t,logoUrl:W()},H())}function Z(t,s){const n=document.createElement("iframe");n.setAttribute("aria-hidden","true"),n.style.cssText="position:fixed;inset:auto 0 0 auto;width:0;height:0;border:0;opacity:0",document.body.appendChild(n);const o=n.contentWindow;o.document.open(),o.document.write(t.replace(/<title>[^<]*<\/title>/,"<title>"+s.replace(/[<>&]/g,"")+"</title>")),o.document.close();const i=()=>{const f=document.title;document.title=s,o.focus(),o.print(),setTimeout(()=>{document.title=f,n.remove()},1500)},u=o.document.fonts,w=Array.from(o.document.images).map(f=>f.complete?Promise.resolve():new Promise(m=>{f.onload=f.onerror=m}));Promise.all([u?u.ready:Promise.resolve(),...w]).then(()=>setTimeout(i,150),()=>setTimeout(i,150))}function K(t,s){let n=String(t||"").replace(/\D/g,"");return/^05\d{8}$/.test(n)?n="966"+n.slice(1):/^01[0125]\d{8}$/.test(n)&&(n="20"+n.slice(1)),/^00/.test(n)&&(n=n.slice(2)),"https://wa.me/"+n+"?text="+encodeURIComponent(s)}const _=(t,s="USD")=>s+" "+(Number(t)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});export{A as a,X as d,_ as m,Z as p,K as w};
