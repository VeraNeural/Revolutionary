const handleDatabaseError = (error) => {
  // Handle undefined_table error (PostgreSQL error code 42P01)
  if (error.code === '42P01') {
    console.warn('⚠️ Table does not exist:', error.message);
    return { error: 'table_missing', message: error.message };
  }
  
  console.error('❌ Database error:', error);
  return { error: 'database_error', message: error.message };
};

module.exports = { handleDatabaseError };