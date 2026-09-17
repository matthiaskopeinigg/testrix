db.categories.insertMany([{ name: 'general' }, { name: 'tools' }]);
db.sample_items.insertMany([
  { name: 'alpha', category: 'general' },
  { name: 'beta', category: 'general' },
  { name: 'gamma', category: 'tools' },
]);
db.sample_items.createIndex({ name: 1 });
