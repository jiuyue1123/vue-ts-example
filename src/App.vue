<script setup lang="ts">
import { fetchLogin } from "../src/service/api/test.ts";

const onClick = () => {
  fetchLogin().then(res => {
    console.log(res.data);
  });
};
</script>

<template>
  <button @click="onClick">点击我进行访问</button>
</template>

<style scoped>

</style>
