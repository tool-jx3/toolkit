function e(e){let t=[],n=[],r=``,i=!1;for(let a=0;a<e.length;a++){let o=e[a];i?o===`"`?e[a+1]===`"`?(r+=`"`,a++):i=!1:r+=o:o===`"`?i=!0:o===`,`?(n.push(r),r=``):o===`
`?(n.push(r),t.push(n),n=[],r=``):r+=o}return n.push(r),t.push(n),t}function t(e){let t=[],n=[],r=e.length,i=0,a=t=>{let n=t;for(;n<r&&e[n]!==`	`&&e[n]!==`
`;)n++;return n};for(;;){let o=null;if(e[i]===`"`){let t=i+1,n=``,a=!1;for(;t<r;){let r=e[t];if(r===`"`){if(e[t+1]===`"`){n+=`"`,t+=2;continue}a=!0,t++;break}n+=r,t++}a&&(t>=r||e[t]===`	`||e[t]===`
`)&&(o=n,i=t)}if(o===null){let t=a(i);o=e.slice(i,t),i=t}if(n.push(o),i>=r)return t.push(n),t;e[i]===`
`&&(t.push(n),n=[]),i++}}function n(n,{quotes:r=!1}={}){let i=String(n??``).replace(/\r\n?/g,`
`).replace(/\n+$/,``);return i.trim()?i.split(`
`,1)[0].includes(`	`)?r?t(i):i.split(`
`).map(e=>e.split(`	`)):e(i):[]}var r=/^'*[=+\-@\t\r]/;function i(e){return r.test(e)?`'${e}`:e}function a(e){return/^'+[=+\-@\t\r]/.test(e)?e.slice(1):e}function o(e,{guard:t=!1}={}){let n=e==null?``:String(e),r=t?i(n):n;return/[",\r\n]/.test(r)?`"${r.replace(/"/g,`""`)}"`:r}function s(e,{bom:t=!1,eol:n=`\r
`,guard:r=!1}={}){let i=(e,t)=>typeof r==`function`?r(e,t):r;return(t?`﻿`:``)+e.map((e,t)=>e.map((e,n)=>o(e,{guard:i(n,t)})).join(`,`)).join(n)}export{s as n,a as r,n as t};