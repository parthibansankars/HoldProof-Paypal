/** Unit tests cover the pure modules (Judge, money, digest, PayPal client). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { strict: true, esModuleInterop: true, module: 'commonjs', target: 'es2022', types: ['jest', 'node'] } }] },
};
