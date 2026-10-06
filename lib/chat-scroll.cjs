function isNearBottom({ scrollTop = 0, clientHeight = 0, scrollHeight = 0, threshold = 48 } = {}) {
  return scrollHeight - (scrollTop + clientHeight) <= Math.max(0, threshold);
}

module.exports = { isNearBottom };
