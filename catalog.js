'use strict';
const CATALOG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRCqmsV0CnHJGD4HJPzK0uRGCvkdtPE4UlMzskL9BWstDooCxxZG8rIduqLATaCvDpP1oVITQvfiHBX/pub?gid=1051402321&single=true&output=csv';
function parseCatalogCSV(text) {
  const rows=[];let row=[],value='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      row.push(value);if(row.some(v=>v.trim()))rows.push(row);row=[];value='';
    }else value+=c;
  }
  if(quoted)throw Error('CSV chưa đầy đủ');
  row.push(value);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
function catalogImageURL(input) {
  const value=String(input||'').trim();if(!value)return '';
  try {
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol))return '';
    if(u.hostname==='drive.google.com') {
      const id=u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] || u.searchParams.get('id');
      if(id&&/^[A-Za-z0-9_-]+$/.test(id))return 'https://drive.google.com/thumbnail?id='+id+'&sz=w1600';
    }
    return u.href;
  }catch{return '';}
}
function catalogRowsToProducts(rows) {
  if(!rows.length)throw Error('Bảng chưa có hàng tiêu đề');
  const headers=rows[0].map(v=>v.trim());
  for(const name of ['Tên sản phẩm','Giá (đ)','Ảnh chính','Mô tả','Hiển thị'])if(!headers.includes(name))throw Error('Thiếu cột '+name);
  const result=[],seen=new Set();let invalid=0;
  for(let i=1;i<rows.length;i++){
    const cells=rows[i],get=name=>String(cells[headers.indexOf(name)]??'').trim();
    if(get('Hiển thị').toLocaleLowerCase('vi-VN')!=='có')continue;
    const name=get('Tên sản phẩm');if(!name){invalid++;continue;}
    const id=get('Mã sản phẩm')||'dong-'+(i+1);if(seen.has(id)){invalid++;continue;}
    const rawPrice=get('Giá (đ)'),normalized=rawPrice.replace(/[.\s₫đ]/gi,'').replace(/,00$/,'');
    const price=rawPrice===''?null:Number(normalized);
    if(price!==null&&(!Number.isFinite(price)||price<0||!Number.isInteger(price))){invalid++;continue;}
    const images=[],labels=[];
    for(const [imageCol,labelCol] of [['Ảnh chính','Chú thích ảnh chính'],['Ảnh bổ sung 1','Chú thích ảnh 2'],['Ảnh bổ sung 2','Chú thích ảnh 3']]){
      const url=catalogImageURL(get(imageCol));if(url){images.push(url);labels.push(get(labelCol)||'Ảnh do cửa hàng cung cấp');}
    }
    if(!images.length){invalid++;continue;}
    seen.add(id);
    result.push({id,name,price,category:get('Danh mục'),desc:get('Mô tả'),subtitle:get('Tiêu đề phụ'),image:images[0],images,imageLabels:labels,badge:''});
  }
  if(invalid)throw Error('Có '+invalid+' dòng sản phẩm chưa hợp lệ');
  return result;
}
let catalogLoading=false,catalogReady=false,catalogTimer;
async function loadCatalogFromSheet() {
  if(catalogLoading)return;
  catalogLoading=true;
  const status=document.getElementById('catalog-status');
  status.textContent=catalogReady?'Đang cập nhật mẫu…':'Đang tải bộ sưu tập…';
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(CATALOG_CSV_URL,{signal:controller.signal,credentials:'omit',cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const next=catalogRowsToProducts(parseCatalogCSV(await response.text()));
    products=next;catalogReady=true;
    if(currentCategory!=='all'&&!products.some(p=>p.category===currentCategory))currentCategory='all';
    renderCategories();renderProducts();
    status.textContent='';
    document.getElementById('catalog-retry').hidden=true;
  }catch(error){
    if(!catalogReady){
      products=[];renderCategories();renderProducts();
      document.getElementById('empty-state').classList.add('hidden');
      status.textContent='Chưa tải được bộ sưu tập. Vui lòng thử lại hoặc nhắn Zalo để xem mẫu.';
    }else status.textContent='Chưa cập nhật được bộ sưu tập mới. Đang hiển thị dữ liệu vừa tải trước đó.';
    document.getElementById('catalog-retry').hidden=false;
    console.warn('Catalog unavailable:',error.message);
  }finally{clearTimeout(timeout);catalogLoading=false;}
}
function startSheetCatalog() {
  products=[];
  document.getElementById('product-grid').innerHTML='';
  document.getElementById('product-count').innerText='…';
  loadCatalogFromSheet();
  clearInterval(catalogTimer);
  catalogTimer=setInterval(()=>{if(!document.hidden&&document.getElementById('product-detail-modal').hidden)loadCatalogFromSheet();},60000);
}
