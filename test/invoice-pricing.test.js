'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function orderFor(items, coupon) {
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 123,
    date: '15/11/2026',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice and pricing use the same HSN GST rate', function () {
  var items = [{ id: 1, sku: 'RICE-1', name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var order = orderFor(items);
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 5);
  assert.equal(order.total, 105);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.tax, order.tax);
  assert.equal(invoiceFigures.total, order.total);
});

test('Invoice figures match billed totals and HSN GST after coupon discount', function () {
  var items = [{ id: 1, sku: 'RICE-1', name: 'Rice', hsn: '1006', price: 640, qty: 1 }];
  var order = orderFor(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.rows[0].lineTax, 28.8);
  assert.equal(invoiceFigures.discount, order.discount);
  assert.equal(invoiceFigures.tax, order.tax);
  assert.equal(invoiceFigures.total, order.total);
});

test('invoice and pricing use the same capped coupon and post-discount GST', function () {
  var items = [{ id: 2, sku: 'TEA-1', name: 'Tea', hsn: '0902', price: 2000, qty: 1 }];
  var order = orderFor(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  // Ledger: capped 10% discount on subtotal; HSN rate is 18%; tax after discount.
  assert.equal(order.discount, 150);
  assert.equal(order.tax, 333);
  assert.equal(order.total, 2183);

  assert.equal(invoiceFigures.discount, order.discount);
  assert.equal(invoiceFigures.tax, order.tax);
  assert.equal(invoiceFigures.total, order.total);
  assert.equal(invoiceFigures.rows[0].lineTax, 333);
});

test('invoice line GST uses the post-discount taxable value', function () {
  var items = [{ id: 3, sku: 'DAL-1', name: 'Dal', hsn: '0713', price: 100, qty: 1 }];
  var order = orderFor(items, 'WELCOME');
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(order.discount, 5);
  assert.equal(order.tax, 4.75);
  assert.equal(order.total, 99.75);
  assert.equal(invoiceFigures.rows[0].lineTax, 4.75);
  assert.equal(invoiceFigures.total, order.total);
});

test('reconciliation matches invoice figures to the stored billed totals', function () {
  var order = orderFor([
    { id: 4, sku: 'GRAIN-1', name: 'Grain', hsn: '1006', price: 100, qty: 1 }
  ]);
  var result = reports.getGstReconciliation({
    orders: [order],
    products: [],
    customers: [],
    settlements: []
  });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.rows[0].ledgerTax, 5);
  assert.equal(result.rows[0].invoiceTax, 5);
  assert.equal(result.rows[0].ledgerTotal, 105);
  assert.equal(result.rows[0].invoiceTotal, 105);
  assert.equal(result.rows[0].delta, 0);
  assert.equal(result.rows[0].matched, true);
});
