from flask import Flask, render_template, request

app = Flask(__name__)


@app.route('/', methods=['GET', 'POST'])
def home():
    theme = 'dark'
    light_active = ''
    dark_active = 'border_info'
    btn_accessible_color = 'text-bg-light'

    if request.method == 'POST':
        if request.form.get('theme') == 'dark':
            theme = 'dark'
        elif request.form.get('theme') == 'light':
            theme = 'light'

    if theme == 'dark':
        dark_active = 'border-primary'
        light_active = 'border-secondary'
        btn_accessible_color = 'text-bg-light'
    elif theme == 'light':
        dark_active = 'border-secondary'
        light_active = 'border-primary'
        btn_accessible_color = 'text-bg-dark'

    theme_picker = render_template(
        'theme_picker.html',
        theme=theme,
        light_active=light_active,
        dark_active=dark_active,
    )

    accessibility_dropdown = render_template(
        'accessibility_dropdown.html',
        theme=theme,
        btn_accessible_color=btn_accessible_color,
        theme_picker=theme_picker
    )

    return render_template(
        'index.html',
        theme=theme,
        accessibility_dropdown=accessibility_dropdown,
        title='Andrew B. Moore'
    )


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)
