export type Product = {id:string;name:string;category:string;price:number;cost:number;stock:number;minStock:number;unit:string;imageName?:string;imageData?:string};
export type Sale = {id:string;receiptId?:string;date:string;at?:string;productId:string;productName:string;qty:number;price:number;cost:number;total:number};
export type Expense = {id:string;date:string;name:string;amount:number;category:string};
export type Waste = {id:string;date:string;ingredient:string;amount:number;reason:string};
export const initialProducts:Product[]=[
{id:"p1",name:"Minyak Goreng 1 Liter",category:"Sembako",price:19000,cost:15500,stock:8,minStock:12,unit:"pcs"},
{id:"p2",name:"Beras Premium 5 kg",category:"Beras & pangan",price:78000,cost:69000,stock:24,minStock:10,unit:"karung"},
{id:"p3",name:"Gula Pasir 1 kg",category:"Sembako",price:17500,cost:14500,stock:18,minStock:10,unit:"pcs"},
{id:"p4",name:"Sabun Cuci Piring",category:"Kebersihan rumah",price:12000,cost:8500,stock:31,minStock:12,unit:"botol"},
{id:"p5",name:"Mi Instan",category:"Makanan kemasan",price:3500,cost:2800,stock:6,minStock:20,unit:"pcs"},
{id:"p6",name:"Panci Serbaguna",category:"Perlengkapan rumah",price:65000,cost:48000,stock:5,minStock:3,unit:"pcs"},
{id:"p7",name:"Air Mineral 600 ml",category:"Minuman kemasan",price:4000,cost:2500,stock:48,minStock:18,unit:"botol"}
];
const now = new Date();
const dateOffset=(n:number)=>{const d=new Date(now);d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
export const initialSales:Sale[]=[
...Array.from({length:42},(_,i)=>{const p=initialProducts[[0,1,2,3,4,6,4,2,6,0,3,1][i%12]];const qty=[2,1,3,2,5,4,6,2,3,1,2,1][i%12];return{id:`s${i+1}`,date:dateOffset(i%14),productId:p.id,productName:p.name,qty,price:p.price,cost:p.cost,total:qty*p.price}})
];
export const initialExpenses:Expense[]=[
{id:"e1",date:dateOffset(1),name:"Listrik toko",amount:350000,category:"Utilitas"},
{id:"e2",date:dateOffset(3),name:"Transportasi pengadaan",amount:125000,category:"Distribusi"},
{id:"e3",date:dateOffset(5),name:"Biaya kantong dan kemasan",amount:85000,category:"Perlengkapan"},
{id:"e4",date:dateOffset(8),name:"Sewa tempat",amount:1000000,category:"Sewa"}
];
export const initialWaste:Waste[]=[
{ id:"w1",date:dateOffset(2),ingredient:"Mi instan kemasan rusak",amount:14000,reason:"Kemasan rusak"},
{ id:"w2",date:dateOffset(6),ingredient:"Minyak goreng bocor",amount:15500,reason:"Barang rusak"}
];
export const rupiah=(n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
export const timeLabel=(at?:string)=>{if(!at)return "";const d=new Date(at);return isNaN(d.getTime())?"":d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).replace(/\./g,":")};
export const dateLabelFull=(s:string)=>new Date(s+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"});
export const dateLabel=(s:string)=>new Date(s+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short"});
