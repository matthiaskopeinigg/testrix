import { describe, expect, it } from 'vitest';

import { applyErdPositions, layoutErd } from './database-erd-layout';

const ordersCustomerFk = {
  name: 'orders_customer_id_fkey',
  table: 'orders',
  columns: ['customer_id'],
  referencedSchema: 'public',
  referencedTable: 'customers',
  referencedColumns: ['id'],
};

const sampleCategoryFk = {
  name: 'sample_items_category_id_fkey',
  table: 'sample_items',
  columns: ['category_id'],
  referencedSchema: 'public',
  referencedTable: 'categories',
  referencedColumns: ['id'],
};

describe('layoutErd', () => {
  it('places referenced tables above dependents', () => {
    const layout = layoutErd({
      schema: 'public',
      tables: [
        { name: 'orders', schema: 'public', kind: 'table' },
        { name: 'customers', schema: 'public', kind: 'table' },
      ],
      foreignKeys: [ordersCustomerFk],
    });
    const customers = layout.nodes.find((node) => node.table === 'customers');
    const orders = layout.nodes.find((node) => node.table === 'orders');
    expect(customers && orders && customers.y < orders.y).toBe(true);
    expect(layout.edges[0]?.path).toContain('M ');
  });

  it('keeps related tables aligned instead of sorting them alphabetically', () => {
    const layout = layoutErd({
      schema: 'public',
      tables: [
        { name: 'categories', schema: 'public', kind: 'table' },
        { name: 'customers', schema: 'public', kind: 'table' },
        { name: 'orders', schema: 'public', kind: 'table' },
        { name: 'sample_items', schema: 'public', kind: 'table' },
      ],
      foreignKeys: [ordersCustomerFk, sampleCategoryFk],
    });
    const categories = layout.nodes.find((node) => node.table === 'categories');
    const customers = layout.nodes.find((node) => node.table === 'customers');
    const orders = layout.nodes.find((node) => node.table === 'orders');
    const samples = layout.nodes.find((node) => node.table === 'sample_items');
    expect(categories && customers && categories.x < customers.x).toBe(true);
    expect(samples && orders && samples.x < orders.x).toBe(true);
    expect(categories && samples && Math.abs(categories.x - samples.x) < 8).toBe(true);
    expect(customers && orders && Math.abs(customers.x - orders.x) < 8).toBe(true);
  });

  it('keeps unrelated tables out of the relation cluster', () => {
    const layout = layoutErd({
      schema: 'public',
      tables: [
        { name: 'customers', schema: 'public', kind: 'table' },
        { name: 'orders', schema: 'public', kind: 'table' },
        { name: 'order_summaries', schema: 'public', kind: 'view' },
      ],
      foreignKeys: [ordersCustomerFk],
    });
    const summaries = layout.nodes.find((node) => node.table === 'order_summaries');
    const customers = layout.nodes.find((node) => node.table === 'customers');
    const orders = layout.nodes.find((node) => node.table === 'orders');
    expect(summaries && customers && orders).toBeTruthy();
    const clusterRight = Math.max(customers!.x + customers!.width, orders!.x + orders!.width);
    expect(summaries!.x).toBeGreaterThan(clusterRight);
  });

  it('rebuilds edges when a card is moved', () => {
    const layout = layoutErd({
      schema: 'public',
      tables: [
        { name: 'orders', schema: 'public', kind: 'table' },
        { name: 'customers', schema: 'public', kind: 'table' },
      ],
      foreignKeys: [ordersCustomerFk],
    });
    const customers = layout.nodes.find((node) => node.table === 'customers');
    expect(customers).toBeTruthy();
    const originalPath = layout.edges[0]?.path ?? '';
    const moved = applyErdPositions(layout, {
      [customers!.id]: { x: 420, y: 80 },
    });
    const next = moved.nodes.find((node) => node.table === 'customers');
    expect(next?.x).toBe(420);
    expect(next?.y).toBe(80);
    expect(moved.edges[0]?.path).not.toBe(originalPath);
  });
});
