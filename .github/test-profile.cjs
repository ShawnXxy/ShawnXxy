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
assert.equal(inputs.markdown_cache, undefined);
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

const template = readFileSync(join(__dirname, "README.md.ejs"), "utf8");
const textPlugins = ["achievements", "code", "discussions", "habits", "introduction",
  "isocalendar", "languages", "lines", "reactions", "traffic"];
assert.equal(inputs.plugin_activity, "yes");
for (const plugin of textPlugins)
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

function format(value, options = {}) {
  if (options.fixed !== undefined)
    return Number(value).toFixed(options.fixed);
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString("en-US") : String(value ?? "");
}
format.date = (timestamp, options) => {
  assert.equal(options.timeZone, inputs.config_timezone);
  return new Date(timestamp).toISOString();
};
format.license = license => license.name;
format.percentage = value => `${Math.round(100 * value)}%`;
format.bytes = value => `${value} B`;

const languages = [
  {name: "PowerShell", value: 0.6, size: 6000},
  {name: "JavaScript", value: 0.4, size: 4000},
];
const basePlugins = {
  introduction: {mode: "user", title: true, text: "Fixture profile introduction."},
  lines: {sections: ["base"], added: 1200, changed: 30, deleted: 450},
  traffic: {views: {count: 120, uniques: 42}},
  languages: {unique: 2, favorites: languages, partial: {}},
  habits: {
    commits: {fetched: 12, hour: "23", day: "Thursday", hours: {9: 2, 23: 7, max: 7}, days: {1: 2, 4: 8, 6: 2, max: 8}},
    indents: {style: "spaces"},
    lines: {average: {chars: 72.5}},
    linguist: {available: true, ordered: [["PowerShell", 0.75], ["JavaScript", 0.25]]},
  },
  isocalendar: {streak: {current: 2, max: 8}, max: 86, average: "2.15"},
  discussions: {
    started: 3,
    comments: 7,
    answers: 2,
    upvotes: {discussions: 4, comments: 5},
    categories: {stats: {"Q&A": 2, Ideas: 1}},
    display: {categories: {limit: 10}},
  },
  reactions: {
    comments: 12,
    total: 6,
    list: {THUMBS_UP: {value: 4, percentage: 4 / 6}, HEART: {value: 2, percentage: 2 / 6}},
  },
  achievements: {
    list: [{prefix: "Great", title: "Committer", rank: "B", text: "Committed regularly.", value: 1200, progress: 0.4, unlock: "1 Jan 2026"}],
  },
  code: {
    snippet: {
      repo: "ShawnXxy/example",
      sha: "0123456789abcdef",
      filename: "src/example.js",
      message: "Handle | Markdown safely",
      created: new Date("2026-01-01T00:00:00Z"),
      patch: '<span class="token prefix inserted">+</span>const fence = "```";<br/><span class="token prefix deleted">-</span>old();',
    },
  },
};

const render = (activity, pluginOverrides = {}) => ejs.render(template, {
  user: {login: inputs.user},
  computed: {
    registration: "10 years ago",
    licenses: {favorite: "MIT", about: {MIT: {name: "MIT"}}},
    repositories: {forked: 4},
    diskUsage: "9.80 GB",
  },
  plugins: {...basePlugins, activity, ...pluginOverrides},
  config: {timezone: {name: inputs.config_timezone}},
  LOGIN: inputs.user,
  REGISTRATION_DATE: new Date("2016-01-01T00:00:00Z"),
  FOLLOWERS: 22,
  FOLLOWING: 58,
  ORGANIZATIONS: 0,
  REPOSITORIES_CONTRIBUTED_TO: 25,
  STARRED: 183,
  WATCHING: 21,
  SPONSORING: 0,
  COMMITS: 1701,
  PULL_REQUESTS: 94,
  PULL_REQUESTS_REVIEWS: 1,
  ISSUES: 2,
  ISSUE_COMMENTS: 84,
  REPOSITORIES: 38,
  RELEASES: 0,
  PACKAGES: 0,
  SPONSORS: 0,
  STARGAZERS: 12,
  FORKS: 7,
  WATCHERS: 5,
  LANGUAGES: languages,
  VERSION: "3.34.0",
  s: count => count === 1 ? "" : "s",
  f: format,
  embed: async () => assert.fail("The text-only profile must not create an SVG embed."),
}, {async: true, views: [join(metrics, "source", "templates", "markdown")]});

(async () => {
  for (const activity of [
    {events},
    {events: [events[0]], timestamps: true},
    {events: [...events].reverse(), timestamps: true},
    {events: events.filter(event => event.type !== "ref/delete")},
    {events: []},
    {error: {message: "Fixture API failure"}},
  ]) {
    const rendered = await render(activity);
    const html = marked.parse(rendered).replace(/<!--[\s\S]*?-->/g, "");

    assert(!rendered.includes("<%"), "No unexpanded EJS in the output.");
    assert(!rendered.includes("undefined"), "Do not render missing values.");
    assert(!rendered.includes("NaN"), "Do not render invalid numbers.");
    assert(!rendered.includes(".cache/github-metrics.svg"), "Do not reference the retired Metrics SVG.");
    assert(!rendered.includes("metrics-cacheable"), "Do not create a Metrics cache image.");
    assert(!/\|[^\n]+\|\r?\n\s*\r?\n\|/.test(rendered), "Keep Markdown table rows contiguous.");
    assert.equal((html.match(/>.*Recent activity<\/a>/g) || []).length, 1);

    if (activity.events?.length) {
      const list = marked.lexer(rendered).find(token => token.type === "list");
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
      assert(rendered.indexOf("Recent activity") < rendered.indexOf("## GitHub overview"));
    }
    else {
      assert(html.includes(activity.error?.message || "No recent activity"));
      assert(!html.includes("/issues/101"));
    }

    for (const heading of ["GitHub overview", "Languages", "Recent coding habits", "Contribution summary",
      "Discussions and reactions", "Achievements", "Code snippet of the day"])
      assert(html.includes(`>${heading}</h2>`), heading);
    assert.equal((html.match(/<table>/g) || []).length, 12, "Render Metrics data as native Markdown tables.");
    assert.equal((html.match(/<details>/g) || []).length, 2, "Keep detailed text sections collapsible.");
    assert(html.includes('<code class="language-diff">'), "Render the code snippet as a fenced diff.");
    assert(html.includes("https://github.com/ShawnXxy/example/commit/0123456789abcdef"));
    assert(html.includes("https://github.com/ShawnXxy/example/blob/0123456789abcdef/src/example.js"));

    for (const label of ["Visitor Count", "trophy"])
      assert(html.includes(`alt="${label}"`), `${label} must remain an image.`);
    for (const destination of ["https://git.io/typing-svg", "https://skillicons.dev", "https://github.com/ShawnXxy/github-profile-trophy"])
      assert(html.includes(`<a href="${destination}">`), destination);
  }

  const pluginFailure = {error: {message: "Fixture | plugin failure"}};
  const failed = await render({events: []}, Object.fromEntries(textPlugins.map(plugin => [plugin, pluginFailure])));
  for (const message of ["Introduction data unavailable", "Language data unavailable", "Coding habit data unavailable",
    "Contribution data unavailable", "Discussion data unavailable", "Reaction data unavailable",
    "Achievement data unavailable", "Code snippet unavailable"])
    assert(failed.includes(message), message);
  assert(failed.includes("Fixture \\| plugin failure"), "Escape plugin errors used in Markdown tables.");
  assert(!failed.includes("Fixture \\\\| plugin failure"), "Do not double-escape table separators.");
  assert(!failed.includes("undefined"));
  assert(!failed.includes("NaN"));

  console.log("Profile checks passed: native Markdown metrics, ordered activity, error handling, static content, and workflow configuration.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
