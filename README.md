# FastTodo

Минималистичный todo-менеджер: задачи с именованными пунктами-чекбоксами, прогресс-баром и двумя режимами просмотра.

## Возможности

- **Задачи** — создание, удаление, сортировка перетаскиванием
- **Пункты** — чекбоксы с произвольными названиями; пустое имя → `Пункт №1`, `Пункт №2`, …
- **Прогресс** — процент выполнения и анимированный бар; праздничная анимация при 100%
- **Две вкладки** — «Текущая» (детальный вид) и «Все задачи» (список)
- **Навигация** — переключение между задачами кнопками с названиями соседних задач
- **Память** — последняя открытая задача сохраняется в `localStorage` и восстанавливается после перезагрузки
- **Текст пунктов** — авто-раскрытие многострочного текста при наведении и редактировании

## Стек

| Слой | Технология |
|------|------------|
| Backend | Flask |
| База данных | SQLite (`todo.db`) |
| Frontend | HTML, CSS, vanilla JS |

## Структура проекта

```
fasttodo/
├── app.py              # Flask-приложение и REST API
├── database.py         # Инициализация и миграции SQLite
├── icon.png            # Favicon
├── requirements.txt
├── templates/
│   └── index.html      # Единственная страница
└── static/
    ├── css/style.css
    └── js/app.js       # UI, drag-and-drop, анимации
```

## Запуск

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Откройте [http://127.0.0.1:5000](http://127.0.0.1:5000).

При первом запуске создаётся `todo.db` в корне проекта.

## Как это устроено

### База данных

Две таблицы:

- `tasks` — `id`, `title`, `position`, `created_at`
- `items` — `id`, `task_id`, `name`, `completed`, `position`

Порядок задач и пунктов хранится в поле `position`. Новая задача встаёт на первое место.

### API

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/tasks` | Список задач с пунктами и прогрессом |
| `POST` | `/api/tasks` | Создать задачу |
| `GET` | `/api/tasks/:id` | Одна задача |
| `DELETE` | `/api/tasks/:id` | Удалить задачу |
| `PUT` | `/api/tasks/reorder` | Изменить порядок (`{ "order": [3, 1, 2] }`) |
| `POST` | `/api/tasks/:id/items` | Добавить пункт |
| `PATCH` | `/api/items/:id` | Отметить / переименовать пункт |
| `DELETE` | `/api/items/:id` | Удалить пункт |

### Frontend

Одностраничное приложение без фреймворков. Состояние живёт в `state` (`app.js`):

- `tasks` — кэш с сервера
- `currentTaskId` — выбранная задача (дублируется в `localStorage` под ключом `fasttodo:lastTaskId`)
- `view` — активная вкладка

При переключении чекбокса состояние обновляется оптимистично — список пунктов не перерисовывается целиком, чтобы не сбивать hover и анимации.

Сортировка задач — pointer events на ручке `⠿`, порядок сохраняется через API.

## Лицензия

**GLWTPL** — Good Luck With That Public License.

Проект полностью навайбкожен: собран в ходе диалога с ИИ без тщательного ревью, тестов и гарантий пригодности. Используйте как есть.

```
Good Luck With That Public License

Everyone is permitted to copy, distribute, modify, translate, reverse
engineer, decompile, disassemble, merge, compile, sell, give away, or
do anything with this software, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

Good luck.
```
