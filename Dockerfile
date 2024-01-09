FROM python:latest

COPY ./requirements.txt /app/requirements.txt

WORKDIR /app

RUN pip install -r requirements.txt

COPY . /app

CMD ["gunicorn", "-w", "4", "-b", "192.168.8.2", "main:app"]
