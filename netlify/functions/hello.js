exports.handler = async (event, context) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'VERA is alive!',
      timestamp: new Date().toISOString()
    })
  };
};