// Run: node .github/test-profile.cjs <metrics-checkout-with-dependencies>
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {createRequire} = require("node:module");
const {join, resolve} = require("node:path");

assert(process.argv[2], "Pass a Metrics checkout containing ejs, marked, and js-yaml.");
const metrics = resolve(process.argv[2]);
const dependency = createRequire(join(metrics, "package.json"));
const ejs = dependency("ejs");
const {marked} = dependency("marked");
const yaml = dependency("js-yaml");
const root = resolve(__dirname, "..");
const workflow = yaml.load(readFileSync(join(__dirname, "workflows", "profile.yml"), "utf8"));
const steps = workflow.jobs["github-metrics"].steps;
const action = steps.find(step => step.uses === "ShawnXxy/metrics@deploy/latest-fixes");
assert(action, "Keep the Metrics fork and ref.");
const inputs = action.with;
assert.equal(inputs.template, "markdown");
assert.equal(inputs.config_output, "markdown");
assert.equal(inputs.filename, "README.md");
assert.equal(inputs.markdown_cache, ".cache");
assert.equal(inputs.markdown, "https://raw.githubusercontent.com/${{ github.repository }}/${{ github.sha }}/.github/README.md.ejs");
assert.equal(inputs.token, "${{ steps.app-token.outputs.token }}");
assert.equal(inputs.config_timezone, "Asia/Shanghai");
assert.equal(inputs.base, "header, activity, community, repositories, metadata");
assert.deepEqual(workflow.on.schedule, [{cron: "0 * * * *"}]);
assert.deepEqual(workflow.on.push.branches, ["master", "main"]);
assert("workflow_dispatch" in workflow.on);
assert.equal(workflow.jobs["github-metrics"].environment.name, "prod");
assert.deepEqual(workflow.jobs["github-metrics"].permissions, {contents: "write"});
assert.equal(steps.find(step => step.id === "app-token").uses, "actions/create-github-app-token@v3");

const q = Object.fromEntries(Object.entries(inputs)
  .filter(([key]) => !["user", "token", "filename", "markdown_cache", "base"].includes(key))
  .map(([key, value]) => [key.replace(/^plugin_/, "").replace(/_/g, "."), value === "yes" ? true : value]));
for (const part of inputs.base.split(", "))
  q[`base.${part}`] = true;
q.base = false;
const svgQuery = Object.fromEntries(Object.entries(q).filter(([key]) => !key.startsWith("activity.")));
const template = readFileSync(join(__dirname, "README.md.ejs"), "utf8");
const readme = readFileSync(join(root, "README.md"), "utf8");
const graphics = ["achievements", "code", "discussions", "habits", "introduction",
  "isocalendar", "languages", "lines", "reactions", "traffic"];
assert.equal(inputs.plugin_activity, "yes");
for (const plugin of graphics)
  assert.equal(inputs[`plugin_${plugin}`], "yes");

const repo = "octocat/Hello-World";
const events = [
  {type: "star", repo},
  {type: "issue", repo, action: "opened", number: 101, title: "Fixture issue"},
  {type: "pr", repo, action: "merged", number: 102, title: "Fixture PR", files: {changed: 1}, lines: {added: 2, deleted: 1}},
  {type: "review", repo, number: 103, title: "Fixture review"},
  {type: "push", repo, size: 1, branch: "main", commits: [{sha: "abc1234", message: "Fixture commit"}]},
];
const destinations = [repo, `${repo}/issues/101`, `${repo}/pull/102`, `${repo}/pull/103`, `${repo}/commit/abc1234`];

(async () => {
  for (const activity of [{events}, {events: []}, {error: {message: "Fixture API failure"}}]) {
    let embeds = 0;
    const rendered = await ejs.render(template, {
      q: {...q},
      user: {login: inputs.user},
      plugins: {activity},
      s: count => count === 1 ? "" : "s",
      embed: async (name, options) => {
        embeds++;
        assert.equal(name, "github-metrics");
        assert.deepEqual(options, {...svgQuery, template: "classic", base: true, activity: false, config_output: "svg"});
        return `<img src="${inputs.markdown_cache}/${name}.svg">`;
      },
    }, {async: true, views: [join(metrics, "source", "templates", "markdown")]});
    const html = marked.parse(rendered);
    assert.equal(embeds, 1);
    assert(!rendered.includes("<%"), "No unexpanded EJS in the output.");
    assert.equal((html.match(/>.*Recent activity<\/a>/g) || []).length, 1);
    assert.match(html, /<img src="\.cache\/github-metrics\.svg">/);
    if (activity.events?.length) {
      for (const destination of destinations)
        assert(html.includes(`<a href="https://github.com/${destination}">`), destination);
      assert(rendered.indexOf("</div>") < rendered.indexOf("Recent activity"));
      assert(rendered.indexOf("Recent activity") < rendered.indexOf('<div align="center">', rendered.indexOf("</div>")));
    }
    else {
      assert(html.includes(activity.error?.message || "No recent activity"));
      assert(!html.includes(`/issues/101`));
    }
    for (const label of ["Visitor Count", "trophy"])
      assert(html.includes(`alt="${label}"`), `${label} must render as an image.`);
    for (const tag of readme.match(/<(?:a|img)\b[^>]*>/g))
      if (!tag.includes(".cache/github-metrics.svg"))
        assert(rendered.includes(tag), `Preserve static HTML: ${tag}`);
    for (const [image] of readme.matchAll(/!\[[^\]]*\]\(https:\/\/[^)]+\)/g))
      assert(rendered.includes(image), `Preserve static Markdown image: ${image}`);
    for (const comment of readme.match(/<!-- References?:[\s\S]*?-->/g))
      assert(rendered.includes(comment), "Preserve reference comments and commented-out stats.");
    for (const destination of ["https://git.io/typing-svg", "https://skillicons.dev", "https://github.com/ShawnXxy/github-profile-trophy"])
      assert(html.includes(`<a href="${destination}">`), destination);
  }
  console.log("Profile checks passed: linked activity, empty/error output, SVG settings, static content, and workflow configuration.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
