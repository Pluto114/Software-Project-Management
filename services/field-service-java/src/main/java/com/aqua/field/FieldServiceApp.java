package com.aqua.field;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;

public class FieldServiceApp {
  private static final int PORT = Integer.parseInt(env("PORT", "3006"));
  private static final FieldStore STORE = new FieldStore(defaultDataDir());
  private static final Map<String, Account> ACCOUNTS = seedAccounts();

  public static void main(String[] args) throws Exception {
    STORE.load();

    HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
    server.createContext("/", FieldServiceApp::handle);
    server.setExecutor(Executors.newFixedThreadPool(8));
    server.start();

    System.out.println("[field-service-java] listening on http://localhost:" + PORT);
    System.out.println("[field-service-java] GET  /api/v1/field/requests");
    System.out.println("[field-service-java] POST /api/v1/field/requests");
    System.out.println("[field-service-java] PATCH /api/v1/field/requests/{id}/review");
  }

  private static void handle(HttpExchange exchange) throws IOException {
    addCors(exchange);
    if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
      send(exchange, 204, "");
      return;
    }

    try {
      String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
      String path = cleanPath(exchange.getRequestURI());

      if ("GET".equals(method) && "/".equals(path)) {
        ok(exchange, obj(
          "status", "ok",
          "service", "field-service-java",
          "message", "Aqua field operations API service. Open /health for health check or use the Vercel frontend for the web app."
        ));
        return;
      }

      if ("GET".equals(method) && "/health".equals(path)) {
        ok(exchange, obj("status", "ok", "service", "field-service-java"));
        return;
      }

      if ("POST".equals(method) && "/api/v1/auth/login".equals(path)) {
        login(exchange);
        return;
      }

      if ("GET".equals(method) && "/api/v1/field/tasks".equals(path)) {
        Context ctx = require(exchange, "admin", "operator");
        ok(exchange, obj("tasks", STORE.listTasks(ctx)));
        return;
      }

      if ("PATCH".equals(method) && path.startsWith("/api/v1/field/tasks/") && path.endsWith("/complete")) {
        Context ctx = require(exchange, "admin", "operator");
        String id = path.substring("/api/v1/field/tasks/".length(), path.length() - "/complete".length());
        Map<String, Object> body = readJson(exchange);
        FieldTask task = STORE.completeTask(id, ctx, str(body, "note"));
        ok(exchange, obj("task", task.toMap()));
        return;
      }

      if ("GET".equals(method) && isRequestList(path)) {
        Context ctx = require(exchange, "admin", "manager", "operator");
        List<Map<String, Object>> requests = STORE.listRequests(ctx);
        if (path.endsWith("/work-orders")) {
          ok(exchange, obj("work_orders", requests));
        } else {
          ok(exchange, obj("requests", requests));
        }
        return;
      }

      if ("POST".equals(method) && isRequestList(path)) {
        Context ctx = require(exchange, "admin", "operator");
        Map<String, Object> body = readJson(exchange);
        FieldRequest request = STORE.createRequest(body, ctx);
        if (path.endsWith("/work-orders")) {
          ok(exchange, obj("work_order", request.toMap()));
        } else {
          ok(exchange, obj("request", request.toMap()));
        }
        return;
      }

      RequestRoute requestRoute = requestRoute(path);
      if (requestRoute != null && "PATCH".equals(method) && "review".equals(requestRoute.action)) {
        Context ctx = require(exchange, "admin", "manager");
        Map<String, Object> body = readJson(exchange);
        FieldRequest request = STORE.reviewRequest(requestRoute.id, bool(body, "approved"), ctx, firstText(body, "message", "note"));
        if (requestRoute.legacy) {
          ok(exchange, obj("work_order", request.toMap()));
        } else {
          ok(exchange, obj("request", request.toMap()));
        }
        return;
      }

      if (requestRoute != null && "PATCH".equals(method) && ("confirm".equals(requestRoute.action) || "complete".equals(requestRoute.action))) {
        Context ctx = require(exchange, "admin", "operator");
        Map<String, Object> body = readJson(exchange);
        FieldRequest request = STORE.confirmRequest(requestRoute.id, ctx, firstText(body, "message", "note"));
        if (requestRoute.legacy) {
          ok(exchange, obj("work_order", request.toMap()));
        } else {
          ok(exchange, obj("request", request.toMap()));
        }
        return;
      }

      error(exchange, 404, "接口不存在");
    } catch (ApiError err) {
      error(exchange, err.status, err.getMessage());
    } catch (Exception err) {
      err.printStackTrace();
      error(exchange, 500, "现场服务异常");
    }
  }

  private static boolean isRequestList(String path) {
    return "/api/v1/field/requests".equals(path) || "/api/v1/field/work-orders".equals(path);
  }

  private static RequestRoute requestRoute(String path) {
    String prefix = null;
    boolean legacy = false;
    if (path.startsWith("/api/v1/field/requests/")) {
      prefix = "/api/v1/field/requests/";
    }
    if (path.startsWith("/api/v1/field/work-orders/")) {
      prefix = "/api/v1/field/work-orders/";
      legacy = true;
    }
    if (prefix == null) return null;

    String rest = path.substring(prefix.length());
    String[] parts = rest.split("/");
    if (parts.length != 2) return null;
    return new RequestRoute(parts[0], parts[1], legacy);
  }

  private static void login(HttpExchange exchange) throws IOException {
    Map<String, Object> body = readJson(exchange);
    String username = str(body, "username").toLowerCase(Locale.ROOT).trim();
    String password = str(body, "password");
    Account account = ACCOUNTS.get(username);
    if (account == null || !account.password.equals(password)) {
      throw new ApiError(401, "账号或密码不正确");
    }

    ok(exchange, obj(
      "token", "demo-" + account.username,
      "user", account.toUserMap()
    ));
  }

  private static Context require(HttpExchange exchange, String... roles) {
    Headers headers = exchange.getRequestHeaders();
    String auth = firstHeader(headers, "Authorization");
    String username = firstHeader(headers, "X-Demo-User");
    String role = firstHeader(headers, "X-Demo-Role");

    if (username == null && auth != null && auth.startsWith("Bearer demo-")) {
      username = auth.substring("Bearer demo-".length());
    }

    Account account = username == null ? null : ACCOUNTS.get(username);
    if (account == null || auth == null || !auth.equals("Bearer demo-" + account.username)) {
      throw new ApiError(401, "请先登录");
    }

    if (role != null && !role.equals(account.role)) {
      throw new ApiError(403, "登录身份不匹配");
    }

    Set<String> allowedRoles = new LinkedHashSet<String>(Arrays.asList(roles));
    if (!allowedRoles.contains(account.role)) {
      throw new ApiError(403, "当前岗位无权操作");
    }

    return new Context(account);
  }

  private static String cleanPath(URI uri) {
    String path = uri.getPath();
    if (path.length() > 1 && path.endsWith("/")) {
      return path.substring(0, path.length() - 1);
    }
    return path;
  }

  private static void addCors(HttpExchange exchange) {
    Headers headers = exchange.getResponseHeaders();
    headers.add("Access-Control-Allow-Origin", "*");
    headers.add("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
    headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Demo-User,X-Demo-Role,X-Demo-Bases");
  }

  private static Map<String, Object> readJson(HttpExchange exchange) throws IOException {
    StringBuilder builder = new StringBuilder();
    BufferedReader reader = new BufferedReader(new InputStreamReader(exchange.getRequestBody(), StandardCharsets.UTF_8));
    String line;
    while ((line = reader.readLine()) != null) {
      builder.append(line);
    }
    String json = builder.toString().trim();
    if (json.isEmpty()) return new LinkedHashMap<String, Object>();
    return MiniJson.parseObject(json);
  }

  private static void ok(HttpExchange exchange, Map<String, Object> body) throws IOException {
    send(exchange, 200, MiniJson.stringify(body));
  }

  private static void error(HttpExchange exchange, int status, String message) throws IOException {
    send(exchange, status, MiniJson.stringify(obj("error", message)));
  }

  private static void send(HttpExchange exchange, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
    Headers headers = exchange.getResponseHeaders();
    headers.set("Content-Type", "application/json; charset=utf-8");
    exchange.sendResponseHeaders(status, bytes.length);
    OutputStream output = exchange.getResponseBody();
    output.write(bytes);
    output.close();
  }

  private static Map<String, Object> obj(Object... pairs) {
    Map<String, Object> map = new LinkedHashMap<String, Object>();
    for (int i = 0; i + 1 < pairs.length; i += 2) {
      map.put(String.valueOf(pairs[i]), pairs[i + 1]);
    }
    return map;
  }

  private static String str(Map<String, Object> body, String key) {
    Object value = body.get(key);
    return value == null ? "" : String.valueOf(value).trim();
  }

  private static String firstText(Map<String, Object> body, String first, String second) {
    String value = str(body, first);
    return value.isEmpty() ? str(body, second) : value;
  }

  private static boolean bool(Map<String, Object> body, String key) {
    Object value = body.get(key);
    if (value instanceof Boolean) return (Boolean) value;
    return "true".equalsIgnoreCase(String.valueOf(value)) || "approved".equalsIgnoreCase(String.valueOf(value));
  }

  private static String firstHeader(Headers headers, String key) {
    List<String> values = headers.get(key);
    return values == null || values.isEmpty() ? null : values.get(0);
  }

  private static String env(String key, String fallback) {
    String value = System.getenv(key);
    return value == null || value.trim().isEmpty() ? fallback : value.trim();
  }

  private static Path defaultDataDir() {
    String override = System.getenv("FIELD_JAVA_DATA_DIR");
    if (override != null && !override.trim().isEmpty()) {
      return Paths.get(override);
    }
    return Paths.get("..", "..", ".local", "field-service-java").toAbsolutePath().normalize();
  }

  private static Map<String, Account> seedAccounts() {
    Map<String, Account> accounts = new LinkedHashMap<String, Account>();
    addAccount(accounts, new Account("admin", "admin123", "翁晨昊", "admin", "企业管理员", "数字化负责人", "总部管理部", "全部基地与系统配置",
      list("A基地", "B基地", "C基地"), "/assets",
      list("asset:read", "asset:write", "asset:delete", "report:read", "trend:read", "ops:read", "production:read", "mobile:read")));
    addAccount(accounts, new Account("manager", "manager123", "周慧", "manager", "养殖部经理", "生产经理", "养殖生产部", "A/B 基地生产与资产",
      list("A基地", "B基地"), "/",
      list("asset:read", "asset:write", "report:read", "trend:read", "production:read")));
    addAccount(accounts, new Account("operator", "operator123", "王涵哲", "operator", "现场巡检", "A基地班组长", "A基地现场班组", "A基地当班池塘",
      list("A基地"), "/mobile",
      list("production:read", "mobile:read")));
    addAccount(accounts, new Account("analyst", "analyst123", "陈鹏翔", "analyst", "经营分析", "经营分析师", "经营分析部", "经营报表与趋势数据",
      list("A基地", "B基地", "C基地"), "/ceo",
      list("report:read", "trend:read")));
    addAccount(accounts, new Account("ops", "ops123", "赵杰瑞", "ops", "平台运维", "平台运维工程师", "信息技术部", "服务状态与链路监控",
      Collections.<String>emptyList(), "/observability",
      list("ops:read")));
    return accounts;
  }

  private static void addAccount(Map<String, Account> accounts, Account account) {
    accounts.put(account.username, account);
  }

  private static List<String> list(String... values) {
    return Arrays.asList(values);
  }

  private static final class Account {
    final String username;
    final String password;
    final String name;
    final String role;
    final String roleLabel;
    final String title;
    final String department;
    final String scopeLabel;
    final List<String> allowedBases;
    final String homePath;
    final List<String> permissions;

    Account(String username, String password, String name, String role, String roleLabel, String title, String department, String scopeLabel, List<String> allowedBases, String homePath, List<String> permissions) {
      this.username = username;
      this.password = password;
      this.name = name;
      this.role = role;
      this.roleLabel = roleLabel;
      this.title = title;
      this.department = department;
      this.scopeLabel = scopeLabel;
      this.allowedBases = allowedBases;
      this.homePath = homePath;
      this.permissions = permissions;
    }

    Map<String, Object> toUserMap() {
      return obj(
        "username", username,
        "name", name,
        "role", role,
        "roleLabel", roleLabel,
        "title", title,
        "department", department,
        "scopeLabel", scopeLabel,
        "allowedBases", allowedBases,
        "homePath", homePath,
        "permissions", permissions
      );
    }
  }

  private static final class Context {
    final Account account;

    Context(Account account) {
      this.account = account;
    }

    boolean canSeeBase(String baseName) {
      return account.allowedBases.contains(baseName);
    }

    boolean isAdmin() {
      return "admin".equals(account.role);
    }

    boolean isOperator() {
      return "operator".equals(account.role);
    }
  }

  private static final class RequestRoute {
    final String id;
    final String action;
    final boolean legacy;

    RequestRoute(String id, String action, boolean legacy) {
      this.id = id;
      this.action = action;
      this.legacy = legacy;
    }
  }

  private static final class FieldStore {
    private final Path dataDir;
    private final Path requestsFile;
    private final Path tasksFile;
    private final List<FieldRequest> requests = new ArrayList<FieldRequest>();
    private final List<FieldTask> tasks = new ArrayList<FieldTask>();

    FieldStore(Path dataDir) {
      this.dataDir = dataDir;
      this.requestsFile = dataDir.resolve("requests.tsv");
      this.tasksFile = dataDir.resolve("tasks.tsv");
    }

    synchronized void load() throws IOException {
      Files.createDirectories(dataDir);
      loadRequests();
      loadTasks();

      if (requests.isEmpty()) {
        seedRequests();
        saveRequests();
      }

      if (tasks.isEmpty()) {
        seedTasks();
        saveTasks();
      }
    }

    synchronized List<Map<String, Object>> listRequests(Context ctx) {
      List<Map<String, Object>> result = new ArrayList<Map<String, Object>>();
      for (FieldRequest request : requests) {
        if (canRead(request, ctx)) {
          result.add(request.toMap());
        }
      }
      return result;
    }

    synchronized FieldRequest createRequest(Map<String, Object> body, Context ctx) throws IOException {
      String baseName = cleanBase(str(body, "base_name"));
      if (baseName.isEmpty()) throw new ApiError(400, "请选择基地");
      if (!ctx.canSeeBase(baseName)) throw new ApiError(403, "不能提交其他基地的申请");

      String priority = str(body, "priority").isEmpty() ? "normal" : str(body, "priority");
      String safetyText = firstText(body, "safety_text", "confirm_text");
      if ("urgent".equals(priority) && !"现场确认".equals(safetyText) && !"CONFIRM".equalsIgnoreCase(safetyText)) {
        throw new ApiError(400, "高风险操作需要输入“现场确认”");
      }

      String actionLabel = firstText(body, "action_label", "request_title");
      FieldRequest request = new FieldRequest();
      request.id = "fr-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
      request.requestNo = "SQ-" + System.currentTimeMillis();
      request.baseName = baseName;
      request.poolCode = required(body, "pool_code", "请选择养殖池");
      request.deviceName = required(body, "device_name", "请选择设备");
      request.actionType = firstText(body, "action_type", "request_type");
      request.actionLabel = actionLabel.isEmpty() ? "设备操作申请" : actionLabel;
      request.priority = priority;
      request.reason = required(body, "reason", "请填写申请原因");
      request.note = firstText(body, "note", "description");
      request.status = "waiting_review";
      request.requestedBy = ctx.account.username;
      request.requestedByName = ctx.account.name;
      request.requestedAt = System.currentTimeMillis();
      request.reviewMessage = "";
      request.completionNote = "";

      requests.add(0, request);
      saveRequests();
      return request;
    }

    synchronized FieldRequest reviewRequest(String id, boolean approved, Context ctx, String message) throws IOException {
      FieldRequest request = findRequest(id);
      if (!ctx.canSeeBase(request.baseName)) throw new ApiError(403, "不能处理其他基地的申请");
      if (!"waiting_review".equals(request.status)) throw new ApiError(409, "该申请已经处理过");

      request.status = approved ? "approved" : "rejected";
      request.reviewedBy = ctx.account.username;
      request.reviewedByName = ctx.account.name;
      request.reviewedAt = System.currentTimeMillis();
      request.reviewMessage = message == null || message.trim().isEmpty()
        ? (approved ? "同意，请按现场安全流程执行。" : "驳回，请补充现场情况后重新提交。")
        : message.trim();

      saveRequests();
      return request;
    }

    synchronized FieldRequest confirmRequest(String id, Context ctx, String message) throws IOException {
      FieldRequest request = findRequest(id);
      if (!ctx.canSeeBase(request.baseName)) throw new ApiError(403, "不能确认其他基地的申请");
      if (ctx.isOperator() && !ctx.account.username.equals(request.requestedBy)) {
        throw new ApiError(403, "只能确认自己提交的申请");
      }
      if (!"approved".equals(request.status)) throw new ApiError(409, "只有管理员同意后的申请才能确认完成");

      request.status = "completed";
      request.completedAt = System.currentTimeMillis();
      request.completionNote = message == null || message.trim().isEmpty() ? "现场已按批准内容执行。" : message.trim();

      saveRequests();
      return request;
    }

    synchronized List<Map<String, Object>> listTasks(Context ctx) {
      List<Map<String, Object>> result = new ArrayList<Map<String, Object>>();
      for (FieldTask task : tasks) {
        if (ctx.canSeeBase(task.baseName)) {
          result.add(task.toMap());
        }
      }
      return result;
    }

    synchronized FieldTask completeTask(String id, Context ctx, String note) throws IOException {
      FieldTask task = null;
      for (FieldTask item : tasks) {
        if (item.id.equals(id)) {
          task = item;
          break;
        }
      }
      if (task == null) throw new ApiError(404, "巡检任务不存在");
      if (!ctx.canSeeBase(task.baseName)) throw new ApiError(403, "不能处理其他基地的巡检任务");

      task.status = "completed";
      task.resultNote = note == null || note.trim().isEmpty() ? "巡检完成，未发现新增异常。" : note.trim();
      task.completedAt = System.currentTimeMillis();
      saveTasks();
      return task;
    }

    private boolean canRead(FieldRequest request, Context ctx) {
      if (!ctx.canSeeBase(request.baseName)) return false;
      return !ctx.isOperator() || ctx.account.username.equals(request.requestedBy);
    }

    private FieldRequest findRequest(String id) {
      for (FieldRequest request : requests) {
        if (request.id.equals(id)) return request;
      }
      throw new ApiError(404, "申请不存在");
    }

    private String required(Map<String, Object> body, String key, String message) {
      String value = str(body, key);
      if (value.isEmpty()) throw new ApiError(400, message);
      return value;
    }

    private void loadRequests() throws IOException {
      if (!Files.exists(requestsFile)) return;
      List<String> lines = Files.readAllLines(requestsFile, StandardCharsets.UTF_8);
      for (String line : lines) {
        if (line.trim().isEmpty()) continue;
        String[] p = line.split("\t", -1);
        if (p.length < 22) continue;
        FieldRequest r = new FieldRequest();
        r.id = p[0];
        r.requestNo = p[1];
        r.baseName = dec(p[2]);
        r.poolCode = dec(p[3]);
        r.deviceName = dec(p[4]);
        r.actionType = dec(p[5]);
        r.actionLabel = dec(p[6]);
        r.priority = p[7];
        r.reason = dec(p[8]);
        r.note = dec(p[9]);
        r.status = p[10];
        r.requestedBy = p[11];
        r.requestedByName = dec(p[12]);
        r.requestedAt = num(p[13]);
        r.reviewedBy = p[14];
        r.reviewedByName = dec(p[15]);
        r.reviewedAt = num(p[16]);
        r.reviewMessage = dec(p[17]);
        r.completedAt = num(p[18]);
        r.completionNote = dec(p[19]);
        r.createdFromSeed = Boolean.parseBoolean(p[20]);
        r.updatedAt = num(p[21]);
        requests.add(r);
      }
    }

    private void saveRequests() throws IOException {
      BufferedWriter writer = Files.newBufferedWriter(requestsFile, StandardCharsets.UTF_8);
      for (FieldRequest r : requests) {
        writer.write(join(
          r.id,
          r.requestNo,
          enc(r.baseName),
          enc(r.poolCode),
          enc(r.deviceName),
          enc(r.actionType),
          enc(r.actionLabel),
          r.priority,
          enc(r.reason),
          enc(r.note),
          r.status,
          r.requestedBy,
          enc(r.requestedByName),
          String.valueOf(r.requestedAt),
          empty(r.reviewedBy),
          enc(r.reviewedByName),
          String.valueOf(r.reviewedAt),
          enc(r.reviewMessage),
          String.valueOf(r.completedAt),
          enc(r.completionNote),
          String.valueOf(r.createdFromSeed),
          String.valueOf(System.currentTimeMillis())
        ));
        writer.newLine();
      }
      writer.close();
    }

    private void loadTasks() throws IOException {
      if (!Files.exists(tasksFile)) return;
      List<String> lines = Files.readAllLines(tasksFile, StandardCharsets.UTF_8);
      for (String line : lines) {
        if (line.trim().isEmpty()) continue;
        String[] p = line.split("\t", -1);
        if (p.length < 12) continue;
        FieldTask task = new FieldTask();
        task.id = p[0];
        task.taskNo = p[1];
        task.baseName = dec(p[2]);
        task.poolCode = dec(p[3]);
        task.title = dec(p[4]);
        task.dueTime = dec(p[5]);
        task.assignee = dec(p[6]);
        task.status = p[7];
        task.checklist = Arrays.asList(dec(p[8]).split("\\|", -1));
        task.resultNote = dec(p[9]);
        task.completedAt = num(p[10]);
        task.updatedAt = num(p[11]);
        tasks.add(task);
      }
    }

    private void saveTasks() throws IOException {
      BufferedWriter writer = Files.newBufferedWriter(tasksFile, StandardCharsets.UTF_8);
      for (FieldTask task : tasks) {
        writer.write(join(
          task.id,
          task.taskNo,
          enc(task.baseName),
          enc(task.poolCode),
          enc(task.title),
          enc(task.dueTime),
          enc(task.assignee),
          task.status,
          enc(joinList(task.checklist, "|")),
          enc(task.resultNote),
          String.valueOf(task.completedAt),
          String.valueOf(System.currentTimeMillis())
        ));
        writer.newLine();
      }
      writer.close();
    }

    private void seedRequests() {
      long now = System.currentTimeMillis();
      FieldRequest waiting = seedRequest("A基地", "P02", "增氧机 #02", "freq_up", "提高增氧频率", "urgent", "DO 连续下降，需要主管确认", "waiting_review", "operator", "王涵哲", now - 15 * 60_000L);
      FieldRequest approved = seedRequest("A基地", "P01", "投喂器 #01", "stop_feed", "暂停一次投喂", "normal", "残饵偏多，申请暂停下一轮投喂", "approved", "operator", "王涵哲", now - 48 * 60_000L);
      approved.reviewedBy = "admin";
      approved.reviewedByName = "翁晨昊";
      approved.reviewedAt = now - 30 * 60_000L;
      approved.reviewMessage = "同意。执行前确认池边人员安全，完成后在手机端确认。";
      requests.add(waiting);
      requests.add(approved);
    }

    private FieldRequest seedRequest(String base, String pool, String device, String type, String label, String priority, String reason, String status, String user, String name, long time) {
      FieldRequest request = new FieldRequest();
      request.id = "fr-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
      request.requestNo = "SQ-" + time;
      request.baseName = base;
      request.poolCode = pool;
      request.deviceName = device;
      request.actionType = type;
      request.actionLabel = label;
      request.priority = priority;
      request.reason = reason;
      request.note = "初始化现场申请";
      request.status = status;
      request.requestedBy = user;
      request.requestedByName = name;
      request.requestedAt = time;
      request.createdFromSeed = true;
      return request;
    }

    private void seedTasks() {
      tasks.add(seedTask("A基地", "P01", "查看水色、溶氧和设备声音", "19:00", list("水色", "溶氧", "设备声音")));
      tasks.add(seedTask("A基地", "P02", "复查低溶氧池边情况", "19:30", list("溶氧", "增氧机", "鱼群状态")));
      tasks.add(seedTask("B基地", "P04", "经理安排的重点池复查", "20:00", list("水温", "投喂", "死鱼巡查")));
    }

    private FieldTask seedTask(String base, String pool, String title, String due, List<String> checklist) {
      FieldTask task = new FieldTask();
      task.id = "ft-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
      task.taskNo = "XJ-" + System.currentTimeMillis() + "-" + pool;
      task.baseName = base;
      task.poolCode = pool;
      task.title = title;
      task.dueTime = due;
      task.assignee = "现场班组";
      task.status = "pending";
      task.checklist = checklist;
      return task;
    }
  }

  private static final class FieldRequest {
    String id;
    String requestNo;
    String baseName;
    String poolCode;
    String deviceName;
    String actionType;
    String actionLabel;
    String priority;
    String reason;
    String note;
    String status;
    String requestedBy;
    String requestedByName;
    long requestedAt;
    String reviewedBy = "";
    String reviewedByName = "";
    long reviewedAt = 0L;
    String reviewMessage = "";
    long completedAt = 0L;
    String completionNote = "";
    boolean createdFromSeed = false;
    long updatedAt = 0L;

    Map<String, Object> toMap() {
      return obj(
        "id", id,
        "request_no", requestNo,
        "base_name", baseName,
        "pool_code", poolCode,
        "device_name", deviceName,
        "action_type", actionType,
        "action_label", actionLabel,
        "priority", priority,
        "reason", reason,
        "note", note,
        "status", status,
        "status_label", statusLabel(status),
        "requested_by", requestedBy,
        "requested_by_name", requestedByName,
        "requested_at", requestedAt,
        "reviewed_by", empty(reviewedBy),
        "reviewed_by_name", empty(reviewedByName),
        "reviewed_at", reviewedAt,
        "review_message", empty(reviewMessage),
        "completed_at", completedAt,
        "completion_note", empty(completionNote),
        "history", history()
      );
    }

    List<Map<String, Object>> history() {
      List<Map<String, Object>> items = new ArrayList<Map<String, Object>>();
      items.add(obj("time", requestedAt, "title", "巡检员提交申请", "by", requestedByName, "message", reason));
      if (reviewedAt > 0L) {
        items.add(obj("time", reviewedAt, "title", "管理员处理申请", "by", reviewedByName, "message", reviewMessage));
      }
      if (completedAt > 0L) {
        items.add(obj("time", completedAt, "title", "巡检员确认完成", "by", requestedByName, "message", completionNote));
      }
      return items;
    }
  }

  private static final class FieldTask {
    String id;
    String taskNo;
    String baseName;
    String poolCode;
    String title;
    String dueTime;
    String assignee;
    String status;
    List<String> checklist;
    String resultNote = "";
    long completedAt = 0L;
    long updatedAt = 0L;

    Map<String, Object> toMap() {
      return obj(
        "id", id,
        "task_no", taskNo,
        "base_name", baseName,
        "pool_code", poolCode,
        "title", title,
        "due_time", dueTime,
        "assignee", assignee,
        "status", status,
        "status_label", "completed".equals(status) ? "已完成" : "待完成",
        "checklist", checklist,
        "result_note", empty(resultNote),
        "completed_at", completedAt
      );
    }
  }

  private static String statusLabel(String status) {
    if ("waiting_review".equals(status)) return "待管理员处理";
    if ("approved".equals(status)) return "已同意";
    if ("rejected".equals(status)) return "已驳回";
    if ("completed".equals(status)) return "已完成";
    return status;
  }

  private static String cleanBase(String value) {
    String base = value == null ? "" : value.trim();
    if ("A".equalsIgnoreCase(base) || base.startsWith("A")) return "A基地";
    if ("B".equalsIgnoreCase(base) || base.startsWith("B")) return "B基地";
    if ("C".equalsIgnoreCase(base) || base.startsWith("C")) return "C基地";
    return base;
  }

  private static String enc(String value) {
    return Base64.getEncoder().encodeToString(empty(value).getBytes(StandardCharsets.UTF_8));
  }

  private static String dec(String value) {
    if (value == null || value.isEmpty()) return "";
    return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
  }

  private static String empty(String value) {
    return value == null ? "" : value;
  }

  private static long num(String value) {
    try {
      return Long.parseLong(value);
    } catch (Exception ignored) {
      return 0L;
    }
  }

  private static String join(String... values) {
    StringBuilder builder = new StringBuilder();
    for (int i = 0; i < values.length; i++) {
      if (i > 0) builder.append('\t');
      builder.append(values[i] == null ? "" : values[i]);
    }
    return builder.toString();
  }

  private static String joinList(List<String> values, String separator) {
    StringBuilder builder = new StringBuilder();
    for (int i = 0; i < values.size(); i++) {
      if (i > 0) builder.append(separator);
      builder.append(values.get(i));
    }
    return builder.toString();
  }

  private static final class ApiError extends RuntimeException {
    final int status;

    ApiError(int status, String message) {
      super(message);
      this.status = status;
    }
  }

  private static final class MiniJson {
    static Map<String, Object> parseObject(String json) {
      Parser parser = new Parser(json);
      Object value = parser.parseValue();
      if (!(value instanceof Map)) {
        throw new ApiError(400, "请求体必须是 JSON 对象");
      }
      return (Map<String, Object>) value;
    }

    static String stringify(Object value) {
      if (value == null) return "null";
      if (value instanceof String) return quote((String) value);
      if (value instanceof Number || value instanceof Boolean) return String.valueOf(value);
      if (value instanceof Map) {
        StringBuilder builder = new StringBuilder("{");
        boolean first = true;
        for (Object entryObject : ((Map<?, ?>) value).entrySet()) {
          Map.Entry<?, ?> entry = (Map.Entry<?, ?>) entryObject;
          if (!first) builder.append(',');
          first = false;
          builder.append(quote(String.valueOf(entry.getKey()))).append(':').append(stringify(entry.getValue()));
        }
        return builder.append('}').toString();
      }
      if (value instanceof Iterable) {
        StringBuilder builder = new StringBuilder("[");
        boolean first = true;
        for (Object item : (Iterable<?>) value) {
          if (!first) builder.append(',');
          first = false;
          builder.append(stringify(item));
        }
        return builder.append(']').toString();
      }
      return quote(String.valueOf(value));
    }

    private static String quote(String value) {
      StringBuilder builder = new StringBuilder("\"");
      for (int i = 0; i < value.length(); i++) {
        char c = value.charAt(i);
        switch (c) {
          case '"': builder.append("\\\""); break;
          case '\\': builder.append("\\\\"); break;
          case '\n': builder.append("\\n"); break;
          case '\r': builder.append("\\r"); break;
          case '\t': builder.append("\\t"); break;
          default:
            if (c < 0x20) {
              builder.append(String.format("\\u%04x", (int) c));
            } else {
              builder.append(c);
            }
        }
      }
      return builder.append('"').toString();
    }

    private static final class Parser {
      private final String json;
      private int index = 0;

      Parser(String json) {
        this.json = json;
      }

      Object parseValue() {
        skip();
        if (index >= json.length()) throw new ApiError(400, "JSON 内容为空");
        char c = json.charAt(index);
        if (c == '{') return parseObjectValue();
        if (c == '[') return parseArray();
        if (c == '"') return parseString();
        if (c == 't' || c == 'f') return parseBoolean();
        if (c == 'n') {
          expect("null");
          return null;
        }
        return parseNumber();
      }

      private Map<String, Object> parseObjectValue() {
        Map<String, Object> map = new LinkedHashMap<String, Object>();
        index++;
        skip();
        if (peek('}')) {
          index++;
          return map;
        }
        while (index < json.length()) {
          String key = parseString();
          skip();
          take(':');
          Object value = parseValue();
          map.put(key, value);
          skip();
          if (peek('}')) {
            index++;
            return map;
          }
          take(',');
        }
        throw new ApiError(400, "JSON 对象格式错误");
      }

      private List<Object> parseArray() {
        List<Object> list = new ArrayList<Object>();
        index++;
        skip();
        if (peek(']')) {
          index++;
          return list;
        }
        while (index < json.length()) {
          list.add(parseValue());
          skip();
          if (peek(']')) {
            index++;
            return list;
          }
          take(',');
        }
        throw new ApiError(400, "JSON 数组格式错误");
      }

      private String parseString() {
        take('"');
        StringBuilder builder = new StringBuilder();
        while (index < json.length()) {
          char c = json.charAt(index++);
          if (c == '"') return builder.toString();
          if (c == '\\') {
            if (index >= json.length()) throw new ApiError(400, "JSON 字符串转义错误");
            char next = json.charAt(index++);
            switch (next) {
              case '"': builder.append('"'); break;
              case '\\': builder.append('\\'); break;
              case '/': builder.append('/'); break;
              case 'b': builder.append('\b'); break;
              case 'f': builder.append('\f'); break;
              case 'n': builder.append('\n'); break;
              case 'r': builder.append('\r'); break;
              case 't': builder.append('\t'); break;
              case 'u':
                if (index + 4 > json.length()) throw new ApiError(400, "JSON unicode 转义错误");
                builder.append((char) Integer.parseInt(json.substring(index, index + 4), 16));
                index += 4;
                break;
              default:
                throw new ApiError(400, "JSON 字符串转义错误");
            }
          } else {
            builder.append(c);
          }
        }
        throw new ApiError(400, "JSON 字符串未结束");
      }

      private Boolean parseBoolean() {
        if (json.startsWith("true", index)) {
          index += 4;
          return Boolean.TRUE;
        }
        if (json.startsWith("false", index)) {
          index += 5;
          return Boolean.FALSE;
        }
        throw new ApiError(400, "JSON 布尔值错误");
      }

      private Number parseNumber() {
        int start = index;
        while (index < json.length()) {
          char c = json.charAt(index);
          if ((c >= '0' && c <= '9') || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') {
            index++;
          } else {
            break;
          }
        }
        String number = json.substring(start, index);
        try {
          return number.contains(".") ? Double.parseDouble(number) : Long.parseLong(number);
        } catch (Exception ignored) {
          throw new ApiError(400, "JSON 数字格式错误");
        }
      }

      private void skip() {
        while (index < json.length() && Character.isWhitespace(json.charAt(index))) index++;
      }

      private boolean peek(char expected) {
        return index < json.length() && json.charAt(index) == expected;
      }

      private void take(char expected) {
        skip();
        if (!peek(expected)) throw new ApiError(400, "JSON 格式错误");
        index++;
      }

      private void expect(String expected) {
        if (!json.startsWith(expected, index)) throw new ApiError(400, "JSON 格式错误");
        index += expected.length();
      }
    }
  }
}
