import {visitSource} from './analytics.mjs';

const target=new URL(document.getElementById('product').href);
const request=new URL(location.href);
const language=request.searchParams.get('lang');
if(/^(zh|en|ja|ko|vi|th|id|es|pt)$/.test(language))target.searchParams.set('lang',language);
target.searchParams.set('src',visitSource(request.href,document.referrer)||'share');
location.replace(target.href);
