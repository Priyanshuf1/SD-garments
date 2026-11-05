const fs = require('fs');

const orders = JSON.parse(fs.readFileSync('data/orders.json', 'utf8'));
const oMatches = (JSON.stringify(orders).match(/genrage/gi) || []).length;
console.log('Orders data genrage matches:', oMatches);

const cust = JSON.parse(fs.readFileSync('data/customers.json', 'utf8'));
const cMatches = (JSON.stringify(cust).match(/genrage/gi) || []).length;
console.log('Customers data genrage matches:', cMatches);

const subs = JSON.parse(fs.readFileSync('data/subscribers.json', 'utf8'));
const sMatches = (JSON.stringify(subs).match(/genrage/gi) || []).length;
console.log('Subscribers data genrage matches:', sMatches);

const adminHtml = fs.readFileSync('admin.html', 'utf8');
const orderCsv = adminHtml.includes('alleyrich_orders_');
const custCsv = adminHtml.includes('alleyrich_customers_');
const subCsv = adminHtml.includes('inner_circle_subscribers_');
console.log('admin.html has alleyrich_orders_ filename?', orderCsv);
console.log('admin.html has alleyrich_customers_ filename?', custCsv);
console.log('admin.html has inner_circle_subscribers_ filename?', subCsv);

if (oMatches === 0 && cMatches === 0 && sMatches === 0 && orderCsv && custCsv && subCsv) {
  console.log('ALL VERIFICATIONS PASSED 100%!');
}
