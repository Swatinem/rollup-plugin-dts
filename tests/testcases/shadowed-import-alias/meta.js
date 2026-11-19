export default {
  downstream: [
    { consumer: "consumer.ts", expectedDts: "expected-consumer.d.ts", compilerOptions: { skipLibCheck: false } },
  ],
};
