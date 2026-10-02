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
  {type: "ref/delete", repo, ref: {type: "branch", name: "retired/<feature>&`"}, marker: "Deleted branch"},
  {type: "star", repo, marker: "Starred"},
  {type: "issue", repo, action: "opened", number: 101, title: "Fixture issue", marker: "Fixture issue"},
  {type: "ref/create", repo, ref: {type: "branch", name: "release/next"}, marker: "Created new branch"},
  {type: "pr", repo, action: "merged", number: 102, title: "Fixture PR", files: {changed: 1}, lines: {added: 2, deleted: 1}, marker: "Fixture PR"},
  {type: "review", repo, number: 103, title: "Fixture review", marker: "Fixture review"},
  {type: "push", repo, size: 1, branch: "main", commits: [{sha: "abc1234", message: "Fixture commit"}], marker: "Fixture commit"},
  {type: "ref/delete", repo, ref: {type: "tag", name: "v0.1.0"}, marker: "Deleted tag"},
].map(event => ({...event, timestamp: new Date("2026-01-01T00:00:00Z")}));
const destinations = [repo, `${repo}/issues/101`, `${repo}/pull/102`, `${repo}/pull/103`, `${repo}/commit/abc1234`];
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>Fixture only</text></svg>';
// Match the Metrics action's cache post-processor, which replaces the entire image tag.
const cacheImage = /(?<match><img class="metrics-cacheable" data-name="(?<name>[\s\S]+?)" src="data:image[/](?<format>(?:svg[+]xml)|jpeg|png);base64,(?<content>[/+=\w]+?)">)/;

(async () => {
  for (const activity of [
    {events},
    {events: [events[0]], timestamps: true},
    {events: [...events].reverse(), timestamps: true},
    {events: events.filter(event => event.type !== "ref/delete")},
    {events: []},
    {error: {message: "Fixture API failure"}},
  ]) {
    let embeds = 0;
    const rendered = await ejs.render(template, {
      q: {...q},
      user: {login: inputs.user},
      plugins: {activity},
      s: count => count === 1 ? "" : "s",
      config: {timezone: {name: inputs.config_timezone}},
      f: {date: (timestamp, options) => {
        assert.equal(options.timeZone, inputs.config_timezone);
        return timestamp.toISOString();
      }},
      embed: async (name, options) => {
        embeds++;
        assert.equal(name, "github-metrics");
        assert.deepEqual(options, {...svgQuery, template: "classic", base: true, activity: false, config_output: "svg"});
        return `<img class="metrics-cacheable" data-name="${name}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`;
      },
    }, {async: true, views: [join(metrics, "source", "templates", "markdown")]});
    const cache = cacheImage.exec(rendered)?.groups;
    assert(cache, "The action must still recognize and cache the SVG embed.");
    assert.equal(Buffer.from(cache.content, "base64").toString(), svg);
    const cached = rendered.replace(cache.match, `<img src="https://github.com/ShawnXxy/ShawnXxy/blob/fixture/${inputs.markdown_cache}/${cache.name}.svg">`);
    const html = marked.parse(cached).replace(/<!--[\s\S]*?-->/g, "");
    assert.equal(embeds, 1);
    assert(!rendered.includes("<%"), "No unexpanded EJS in the output.");
    assert(!cached.includes("data:image/"), "No uncached SVG data URI in the output.");
    assert.equal((html.match(/>.*Recent activity<\/a>/g) || []).length, 1);
    if (activity.events?.length) {
      const list = marked.lexer(cached).find(token => token.type === "list");
      assert.equal(list?.items.length, activity.events.length, "Keep every event in the same activity list.");
      if (activity.events.length > 1)
        for (const destination of destinations)
          assert(html.includes(`<a href="https://github.com/${destination}">`), destination);
      let previous = -1;
      for (const event of activity.events) {
        const position = html.indexOf(event.marker);
        assert(position > previous, `Missing or reordered activity: ${event.marker}`);
        previous = position;
        if (event.type === "ref/delete")
          assert(html.includes(`<code>${ejs.escapeXML(event.ref.name)}</code>`), "Escape deleted ref names.");
      }
      assert.equal((html.match(/<em>On /g) || []).length, activity.timestamps ? activity.events.length : 0);
      assert(rendered.indexOf("</div>") < rendered.indexOf("Recent activity"));
      assert(rendered.indexOf("Recent activity") < rendered.indexOf('<div align="center">', rendered.indexOf("</div>")));
    }
    else {
      assert(html.includes(activity.error?.message || "No recent activity"));
      assert(!html.includes(`/issues/101`));
    }
    const images = [...html.matchAll(/<img\b[^>]*src="[^"]*\/github-metrics\.svg"[^>]*>/g)];
    assert.equal(images.length, 1, "Render the metrics image only once.");
    assert.match(images[0][0], /\balt="Metrics"/, "Preserve the metrics label after cache processing.");
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
  console.log("Profile checks passed: ordered activity including deletions, timestamps, cached SVG alt text, static content, and workflow configuration.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
