<script setup>
defineProps({name:String,size:{type:Number,default:20}})
const paths = {
  logo:'M3 17 9 7h5l-6 10H3Zm9 0 6-10h3l-6 10h-3Z',
  oil:'M12 3c2.5 4 6 7.2 6 11a6 6 0 0 1-12 0c0-3.8 3.5-7 6-11Zm-3 11a3 3 0 0 0 3 3',
  wheel:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v5m0 8v5M3 12h5m8 0h5',
  scan:'M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4M6 12h3l2-4 3 8 2-4h2',
  brakes:'M12 3a9 9 0 1 0 9 9m-9-9v4m0 10a5 5 0 1 1 3.5-8.5M18 3l3 3-5 5-3-3 5-5ZM8 17l-2 2',
  calendar:'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm-2 5h18M8 3v4m8-4v4m-8 7h2m4 0h2m-8 3h2',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  arrow:'M4 12h15m-6-6 6 6-6 6',
  left:'m15 6-6 6 6 6',right:'m9 6 6 6-6 6',
  check:'m5 12 4 4L19 6',
  shield:'m12 3 8 3v6c0 4.5-3 7-8 9-5-2-8-4.5-8-9V6l8-3Zm-3 9 2 2 4-4',
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name]"/></svg></template>
