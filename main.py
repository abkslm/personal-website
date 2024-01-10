from flask import Flask, render_template, request

app = Flask(__name__)


@app.route('/', methods=['GET'])
def home():
    theme = 'dark'
    light_border = ''
    dark_border = 'border_info'
    btn_accessible_color = 'text-bg-light'

    if request.method == 'GET':
        if request.args.get('theme') == 'dark':
            theme = 'dark'
        elif request.args.get('theme') == 'light':
            theme = 'light'

    if theme == 'dark':
        dark_border = 'border-primary'
        light_border = 'border-secondary'
        btn_accessible_color = 'text-bg-light'
    elif theme == 'light':
        dark_border = 'border-secondary'
        light_border = 'border-primary'
        btn_accessible_color = 'text-bg-dark'

    theme_picker = render_template(
        'theme_picker.html',
        light_border=light_border,
        dark_border=dark_border,
    )

    accessibility_dropdown = render_template(
        'accessibility_dropdown.html',
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
